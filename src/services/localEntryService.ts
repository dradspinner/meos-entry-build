// Local Entry Storage Service
// Manages entries locally until they are checked in to MeOS

import { meosClassService } from './meosClassService';
import { localRunnerService } from './localRunnerService';

export interface LocalEntry {
  id: string;
  // Personal info
  name: {
    first: string;
    last: string;
  };
  club: string;
  birthYear: string;
  sex: string;
  nationality: string;
  phone?: string;
  
  // Competition info
  classId: string;
  className: string;
  cardNumber: string;
  isHiredCard?: boolean; // Track if this is a hired/rental card
  fee: number;
  
  // Status
  status: 'pending' | 'checked-in' | 'started' | 'finished';
  checkedInAt?: Date;
  submittedToMeosAt?: Date;
  meosEntryId?: string; // Track MeOS entry ID if known
  
  // Import info
  importedFrom: 'jotform' | 'manual' | 'other';
  importedAt: Date;
  
  // Issues tracking
  issues: {
    needsRentalCard: boolean; // True if they specifically requested a rental card (Rented='X')
    needsCardButNoRental: boolean; // True if they need a card but didn't request rental (Rented='0' but no card provided)
    missingBirthYear: boolean;
    missingSex: boolean;
    placeholderCard: boolean;
    needsNameCapitalization: boolean;
  };
}

class LocalEntryService {
  private readonly STORAGE_KEY = 'meos_local_entries';
  private readonly BACKUP_KEY = 'meos_local_entries_backup';
  private readonly PATH_KEY = 'meos_last_import_path';
  private readonly DIR_HANDLE_KEY = 'meos_working_directory';
  private readonly FILE_STORAGE_AVAILABLE = typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  private workingDirectoryHandle: any = null;
  // When we can't get a directory handle, remember the file handle to open pickers in the same folder
  private workingFileHandle: any = null;

  /**
   * Get all local entries
   */
  getAllEntries(): LocalEntry[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];
      
      const entries = JSON.parse(stored);
      // Convert date strings back to Date objects
      return entries.map((entry: any) => ({
        ...entry,
        importedAt: new Date(entry.importedAt),
        checkedInAt: entry.checkedInAt ? new Date(entry.checkedInAt) : undefined,
        submittedToMeosAt: entry.submittedToMeosAt ? new Date(entry.submittedToMeosAt) : undefined,
      }));
    } catch (error) {
      console.error('Error loading local entries:', error);
      return [];
    }
  }

  /**
   * Save all entries to local storage with backup
   */
  private saveEntries(entries: LocalEntry[]): void {
    try {
      const dataString = JSON.stringify(entries, null, 2);
      
      // Save current data
      localStorage.setItem(this.STORAGE_KEY, dataString);
      
      // Keep a backup of previous data
      const currentData = localStorage.getItem(this.STORAGE_KEY);
      if (currentData && currentData !== dataString) {
        localStorage.setItem(this.BACKUP_KEY, currentData);
      }
      
      // Auto-save to file after EVERY change (not just every 10)
      if (entries.length > 0) {
        this.autoBackupToFile(entries);
      }
      
    } catch (error) {
      console.error('Error saving local entries:', error);
      // Try to recover from backup
      this.recoverFromBackup();
    }
  }

  /**
   * Add a new entry (from import)
   */
  addEntry(entry: Omit<LocalEntry, 'id' | 'status' | 'importedAt' | 'issues'>): LocalEntry {
    const entries = this.getAllEntries();
    
    const newEntry: LocalEntry = {
      ...entry,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      importedAt: new Date(),
      issues: this.calculateIssues(entry),
    };

    entries.push(newEntry);
    this.saveEntries(entries);
    
    console.log('Added local entry:', newEntry);
    return newEntry;
  }

  /**
   * Import a complete entry (preserves all fields including status)
   * Used specifically for JSON backup imports
   */
  importEntry(entry: Omit<LocalEntry, 'id'>): LocalEntry {
    const entries = this.getAllEntries();
    
    const importedEntry: LocalEntry = {
      ...entry,
      id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      // Preserve the original status, importedAt, and other fields
      issues: this.calculateIssues(entry),
    };

    entries.push(importedEntry);
    this.saveEntries(entries);
    
    console.log('Imported local entry with preserved status:', {
      name: `${importedEntry.name.first} ${importedEntry.name.last}`,
      status: importedEntry.status,
      checkedInAt: importedEntry.checkedInAt,
      submittedToMeosAt: importedEntry.submittedToMeosAt
    });
    return importedEntry;
  }

  /**
   * Update an existing entry
   */
  updateEntry(id: string, updates: Partial<LocalEntry>): LocalEntry | null {
    const entries = this.getAllEntries();
    const index = entries.findIndex(e => e.id === id);
    
    if (index === -1) return null;
    
    // Apply name capitalization if name is being updated
    const updatedData = { ...updates };
    if (updatedData.name) {
      updatedData.name = {
        first: this.capitalizeNamePart(updatedData.name.first || ''),
        last: this.capitalizeNamePart(updatedData.name.last || '')
      };
    }
    
    entries[index] = { 
      ...entries[index], 
      ...updatedData,
      issues: this.calculateIssues({ ...entries[index], ...updatedData }),
    };
    
    this.saveEntries(entries);
    return entries[index];
  }

  /**
   * Check in an entry (mark as ready for MeOS submission)
   */
  checkInEntry(id: string, actualCardNumber?: string): LocalEntry | null {
    const updates: Partial<LocalEntry> = {
      status: 'checked-in',
      checkedInAt: new Date(),
    };
    
    // If provided, update with actual card number
    if (actualCardNumber && actualCardNumber.trim() !== '') {
      updates.cardNumber = actualCardNumber.trim();
    }
    
    return this.updateEntry(id, updates);
  }

  /**
   * Mark entry as submitted to MeOS
   */
  markSubmittedToMeos(id: string): LocalEntry | null {
    return this.updateEntry(id, {
      submittedToMeosAt: new Date(),
    });
  }

  /**
   * Export hired cards CSV for MeOS import
   */
  async exportHiredCardsCSV(options: { asDefaultFile?: boolean, filename?: string } = {}): Promise<{ filename: string, cardCount: number }> {
    const entries = this.getAllEntries();
    const hiredCardNumbers = new Set<string>();
    
    // Collect all unique hired card numbers from local entries
    entries.forEach(entry => {
      if (entry.isHiredCard && entry.cardNumber && entry.cardNumber !== '0') {
        hiredCardNumbers.add(entry.cardNumber);
      }
    });
    
    // Convert to sorted array for consistent output
    const sortedCards = Array.from(hiredCardNumbers).sort((a, b) => parseInt(a) - parseInt(b));
    
    if (sortedCards.length === 0) {
      console.log('[HiredCards] No hired cards found to export');
      throw new Error('No hired cards found to export');
    }
    
    // Determine filename
    const filename = options.filename || 
      (options.asDefaultFile ? 'hired_card_default.csv' : 'dvoa_hired_cards.csv');
    
    // Create CSV content (just card numbers, one per line)
    const csvContent = sortedCards.join('\n');
    
    try {
      if (this.FILE_STORAGE_AVAILABLE) {
        // Use File System Access API if available
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'CSV files',
            accept: {
              'text/csv': ['.csv'],
            },
          }],
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(csvContent);
        await writable.close();
        
        console.log(`[HiredCards] Exported ${sortedCards.length} hired cards to ${filename}`);
      } else {
        // Fallback: download as file
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log(`[HiredCards] Downloaded ${sortedCards.length} hired cards as ${filename}`);
      }
      
      return { filename, cardCount: sortedCards.length };
    } catch (error) {
      console.error('[HiredCards] Failed to export hired cards CSV:', error);
      throw error;
    }
  }
  
  /**
   * Get count of hired cards in system
   */
  getHiredCardCount(): number {
    const entries = this.getAllEntries();
    const hiredCardNumbers = new Set<string>();
    
    entries.forEach(entry => {
      if (entry.isHiredCard && entry.cardNumber && entry.cardNumber !== '0') {
        hiredCardNumbers.add(entry.cardNumber);
      }
    });
    
    return hiredCardNumbers.size;
  }
  
  /**
   * Get list of hired cards for display
   */
  getHiredCardsList(): string[] {
    const entries = this.getAllEntries();
    const hiredCardNumbers = new Set<string>();
    
    entries.forEach(entry => {
      if (entry.isHiredCard && entry.cardNumber && entry.cardNumber !== '0') {
        hiredCardNumbers.add(entry.cardNumber);
      }
    });
    
    return Array.from(hiredCardNumbers).sort((a, b) => parseInt(a) - parseInt(b));
  }

  /**
   * Delete an entry
   */
  deleteEntry(id: string): boolean {
    const entries = this.getAllEntries();
    const filteredEntries = entries.filter(e => e.id !== id);
    
    if (filteredEntries.length < entries.length) {
      this.saveEntries(filteredEntries);
      return true;
    }
    
    return false;
  }

  /**
   * Properly capitalize name parts (Title Case)
   */
  private capitalizeNamePart(namePart: string): string {
    if (!namePart || namePart.trim() === '') return '';
    
    const trimmed = namePart.trim();
    // Handle hyphenated names (e.g., "Mary-Jane", "O'Connor")
    const parts = trimmed.split(/[-'\s]+/);
    
    return parts.map(part => {
      if (part.length === 0) return part;
      
      // Handle McNames, MacDonald patterns
      if (part.toLowerCase().startsWith('mc') && part.length > 2) {
        return part[0].toUpperCase() + 'c' + part[2].toUpperCase() + part.slice(3).toLowerCase();
      }
      if (part.toLowerCase().startsWith('mac') && part.length > 3) {
        return part[0].toUpperCase() + 'ac' + part[3].toUpperCase() + part.slice(4).toLowerCase();
      }
      
      // Standard title case: First letter uppercase, rest lowercase
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    }).join(parts.length > 1 ? (trimmed.includes('-') ? '-' : (trimmed.includes("'") ? "'" : ' ')) : '');
  }

  /**
   * Check if names have proper capitalization (Title Case)
   */
  private checkNameCapitalization(name?: { first: string; last: string }): boolean {
    if (!name || !name.first || !name.last) {
      return false; // Don't flag as capitalization issue if names are missing
    }
    
    // Helper function to check if a name part has proper Title Case
    const isProperTitleCase = (namePart: string): boolean => {
      const trimmed = namePart.trim();
      if (!trimmed) return true;
      
      // Handle hyphenated names (e.g., "Mary-Jane", "O'Connor")
      const parts = trimmed.split(/[-'\s]+/);
      
      return parts.every(part => {
        if (part.length === 0) return true;
        
        // First letter should be uppercase, rest lowercase
        // Exception: McNames, MacDonald patterns
        if (part.toLowerCase().startsWith('mc') && part.length > 2) {
          return part[0] === part[0].toUpperCase() && 
                 part[1] === 'c' &&
                 part[2] === part[2].toUpperCase();
        }
        if (part.toLowerCase().startsWith('mac') && part.length > 3) {
          return part[0] === part[0].toUpperCase() && 
                 part[1] === 'a' && part[2] === 'c' &&
                 part[3] === part[3].toUpperCase();
        }
        
        // Standard title case: First letter uppercase, rest lowercase
        return part[0] === part[0].toUpperCase() && 
               part.slice(1) === part.slice(1).toLowerCase();
      });
    };
    
    const firstNameOk = isProperTitleCase(name.first);
    const lastNameOk = isProperTitleCase(name.last);
    
    // Return true if there's a capitalization issue (needs fixing)
    return !firstNameOk || !lastNameOk;
  }
  
  /**
   * Calculate issues for an entry
   */
  private calculateIssues(entry: Partial<LocalEntry & { needsRentalCard?: boolean; wantsRentalCard?: boolean }>): LocalEntry['issues'] {
    const cardNum = parseInt(entry.cardNumber || '0');
    const isGroup = parseInt(entry.nationality || '0') >= 2;
    const hasNoCard = cardNum === 0 || !entry.cardNumber || entry.cardNumber.trim() === '' || entry.cardNumber.trim() === '0';
    
    let needsRental = false;
    let needsCardButNoRental = false;
    
    if (entry.needsRentalCard !== undefined) {
      // From OE12 import - use the explicit flags
      // If they originally requested rental (Rented='X') but now have a card, rental is fulfilled
      needsRental = entry.needsRentalCard && hasNoCard; // Only still need rental if they requested it AND still have no card
      needsCardButNoRental = hasNoCard && !entry.needsRentalCard; // Has no card but didn't request rental
    } else {
      // Legacy/manual entry logic - assume they want rental if no card provided
      needsRental = hasNoCard;
      needsCardButNoRental = false;
    }
    
    // Check for name capitalization issues
    const hasNameCapitalizationIssue = this.checkNameCapitalization(entry.name);
    
    return {
      needsRentalCard: needsRental,
      needsCardButNoRental: needsCardButNoRental,
      missingBirthYear: !isGroup && (!entry.birthYear || entry.birthYear.trim() === ''),
      missingSex: !isGroup && (!entry.sex || entry.sex.trim() === ''),
      placeholderCard: false, // No longer using placeholder cards
      needsNameCapitalization: hasNameCapitalizationIssue,
    };
  }

  /**
   * Set a preferred save directory name
   */
  setSaveDirectoryPreference(directoryName: string): void {
    try {
      localStorage.setItem(this.PATH_KEY, directoryName);
      console.log(`[LocalStorage] Set save directory preference: ${directoryName}`);
    } catch (error) {
      console.warn('Failed to save directory preference:', error);
    }
  }

  /**
   * Get the preferred save directory name
   */
  getSaveDirectoryPreference(): string {
    try {
      return localStorage.getItem(this.PATH_KEY) || 'MeOS Event Entries';
    } catch (error) {
      console.warn('Failed to retrieve directory preference:', error);
      return 'MeOS Event Entries';
    }
  }

  /**
   * Set working directory where files should be saved
   */
  async setWorkingDirectory(): Promise<boolean> {
    if (!('showDirectoryPicker' in window)) {
      // Firefox fallback - let user manually specify directory name
      return this.setWorkingDirectoryFallback();
    }

    try {
      const dirHandle = await (window as any).showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'documents'
      });
      
      this.workingDirectoryHandle = dirHandle;
      console.log(`[LocalStorage] Set working directory: ${dirHandle.name}`);
      return true;
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name !== 'AbortError') {
        console.error('Failed to set working directory:', error);
      }
      return false;
    }
  }

  /**
   * Directly set working directory handle (when already obtained)
   */
  async setWorkingDirectoryHandle(dirHandle: any): Promise<boolean> {
    try {
      if (!dirHandle) return false;
      // Request read/write permission
      if (dirHandle.requestPermission) {
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') {
          console.warn('[LocalStorage] Directory permission not granted');
          return false;
        }
      }
      this.workingDirectoryHandle = dirHandle;
      console.log(`[LocalStorage] Set working directory: ${dirHandle.name}`);
      return true;
    } catch (error) {
      console.warn('Failed to set working directory handle:', error);
      return false;
    }
  }

  /**
   * Attempt to set working directory based on a selected file handle (CSV location)
   * - If the browser supports fileHandle.getParent(), use it to get the directory handle
   * - Otherwise, remember the file handle to open future pickers in the same folder
   */
  async setWorkingDirectoryFromFileHandle(fileHandle: any): Promise<boolean> {
    try {
      if (!fileHandle) return false;

      // Progressive enhancement: some browsers may expose getParent()
      const anyHandle = fileHandle as any;
      if (anyHandle && typeof anyHandle.getParent === 'function') {
        try {
          const dirHandle = await anyHandle.getParent();
          if (dirHandle) {
            return await this.setWorkingDirectoryHandle(dirHandle);
          }
        } catch (parentErr) {
          console.warn('[LocalStorage] getParent() not available/failed:', parentErr);
        }
      }

      // Fallback: remember the file handle so save pickers can start in the same folder
      this.workingFileHandle = fileHandle;
      console.log('[LocalStorage] Remembering CSV file handle to start future saves in the same folder');

      // Also set a reasonable directory preference name based on the file name
      const baseName = (fileHandle.name || '').replace(/\.[^/.]+$/, '');
      if (baseName) {
        this.setSaveDirectoryPreference(`${baseName} - MeOS Event`);
      }

      return false;
    } catch (error) {
      console.warn('Failed to set working directory from file handle:', error);
      return false;
    }
  }

  /**
   * Attempt to set working directory from a File object (Electron/Chromium may expose full path)
   */
  async setWorkingDirectoryFromSelectedFile(file: File): Promise<boolean> {
    try {
      if (!file) return false;
      const anyFile: any = file as any;
      const fullPath: string | undefined = anyFile.path || anyFile.mozFullPath || undefined;
      if (fullPath && typeof fullPath === 'string') {
        // Derive directory path from file path
        const dirPath = fullPath.replace(/[\\\/]([^\\\/]+)$/,'');
        // Store path for Firefox/electron fallback flows
        localStorage.setItem('meos_working_directory_path', dirPath);
        const dirName = dirPath.split(/[\\\/]/).pop() || dirPath;
        this.setSaveDirectoryPreference(dirName);
        console.log(`[LocalStorage] Set working directory from file path: ${dirPath}`);
        return true;
      }

      // If no path is available, fall back to naming preference by file base name
      const baseName = (file.name || '').replace(/\.[^/.]+$/, '');
      if (baseName) {
        this.setSaveDirectoryPreference(`${baseName} - MeOS Event`);
      }
      return false;
    } catch (error) {
      console.warn('Failed to set working directory from selected file:', error);
      return false;
    }
  }

  /**
   * Fallback for browsers without File System Access API (like Firefox)
   */
  private setWorkingDirectoryFallback(): boolean {
    const userPath = prompt(
      'Enter the full path to your working directory\n' +
      '(e.g., C:\\Users\\YourName\\Documents\\HickoryRun_Event)\n\n' +
      'This is where backup files will be saved.'
    );
    
    if (userPath && userPath.trim()) {
      // Store the path preference
      const pathName = userPath.split('\\').pop() || userPath;
      this.setSaveDirectoryPreference(pathName);
      localStorage.setItem('meos_working_directory_path', userPath.trim());
      console.log(`[LocalStorage] Set working directory path: ${userPath.trim()}`);
      return true;
    }
    
    return false;
  }

  /**
   * Get current working directory name
   */
  getWorkingDirectoryName(): string | null {
    // Chrome/Edge with File System Access API
    if (this.workingDirectoryHandle?.name) {
      return this.workingDirectoryHandle.name;
    }
    
    // Firefox fallback - get from stored preference
    const storedPath = localStorage.getItem('meos_working_directory_path');
    if (storedPath) {
      return storedPath.split('\\').pop() || storedPath;
    }
    
    return null;
  }

  /**
   * Get full working directory path (Firefox fallback)
   */
  getWorkingDirectoryPath(): string | null {
    return localStorage.getItem('meos_working_directory_path');
  }

  /**
   * Find existing entry that matches the given criteria
   */
  private findExistingEntry(name: { first: string, last: string }, birthYear: string, club: string): LocalEntry | null {
    const entries = this.getAllEntries();
    
    // Normalize names and data for comparison
    const normalizeString = (str: string) => str.toLowerCase().trim().replace(/\s+/g, ' ');
    const targetFirstName = normalizeString(name.first);
    const targetLastName = normalizeString(name.last);
    const targetBirthYear = birthYear.trim();
    const targetClub = normalizeString(club);
    
    return entries.find(entry => {
      const entryFirstName = normalizeString(entry.name.first);
      const entryLastName = normalizeString(entry.name.last);
      const entryBirthYear = entry.birthYear.trim();
      const entryClub = normalizeString(entry.club);
      
      // Match on first name, last name, and birth year
      // Club is optional (in case someone changes clubs)
      const nameAndYearMatch = entryFirstName === targetFirstName && 
                              entryLastName === targetLastName && 
                              entryBirthYear === targetBirthYear;
      
      // If names and year match, it's likely the same person
      if (nameAndYearMatch) {
        return true;
      }
      
      // Additional check: exact name match with same club (in case birth year is missing/different)
      const nameAndClubMatch = entryFirstName === targetFirstName && 
                              entryLastName === targetLastName && 
                              targetClub && entryClub === targetClub;
      
      return nameAndClubMatch;
    }) || null;
  }
  
  /**
   * Add or update an entry (from import)
   */
  addOrUpdateEntry(entry: Omit<LocalEntry, 'id' | 'status' | 'importedAt' | 'issues'> & { needsRentalCard?: boolean }): { entry: LocalEntry, isNew: boolean } {
    const existingEntry = this.findExistingEntry(entry.name, entry.birthYear, entry.club);
    
    if (existingEntry) {
      // Update existing entry with new data while preserving status and history
      // Create an updateData object that includes the needsRentalCard flag for calculateIssues
      const updateData = {
        name: entry.name,
        club: entry.club,
        birthYear: entry.birthYear,
        sex: entry.sex,
        nationality: entry.nationality,
        phone: entry.phone,
        classId: entry.classId,
        className: entry.className,
        cardNumber: entry.cardNumber,
        fee: entry.fee,
        importedFrom: entry.importedFrom,
        // Keep existing status and timestamps unless it's pending
        ...(existingEntry.status === 'pending' ? {} : {
          status: existingEntry.status,
          checkedInAt: existingEntry.checkedInAt,
          submittedToMeosAt: existingEntry.submittedToMeosAt
        })
      };
      
      // Manually update the entry to pass the needsRentalCard flag through calculateIssues
      const entries = this.getAllEntries();
      const index = entries.findIndex(e => e.id === existingEntry.id);
      
      if (index === -1) return { entry: existingEntry, isNew: false };
      
      entries[index] = { 
        ...entries[index], 
        ...updateData,
        issues: this.calculateIssues({ ...entries[index], ...updateData, needsRentalCard: entry.needsRentalCard }),
      };
      
      this.saveEntries(entries);
      const updatedEntry = entries[index];
      
      console.log('Updated existing entry with needsRentalCard flag:', updatedEntry);
      return { entry: updatedEntry, isNew: false };
    } else {
      // Add new entry
      const newEntry = this.addEntry(entry);
      return { entry: newEntry, isNew: true };
    }
  }

  /**
   * Auto-detect CSV format and import entries
   */
  async importFromCsv(
    csvEntries: any[], 
    fileName?: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ entries: LocalEntry[], newCount: number, updatedCount: number, format: string }> {
    // Auto-detect format based on headers
    const format = this.detectCsvFormat(csvEntries);
    console.log(`[CSV Import] Detected format: ${format}`);
    
    let result;
    if (format === 'OE12') {
      result = await this.importFromOE12(csvEntries, fileName, onProgress);
    } else {
      result = await this.importFromJotform(csvEntries, fileName, onProgress);
    }
    
    return { ...result, format };
  }

  /**
   * Detect CSV format based on headers
   */
  private detectCsvFormat(csvEntries: any[]): string {
    if (csvEntries.length === 0) return 'unknown';
    
    const headers = Object.keys(csvEntries[0]);
    const headerString = headers.join(',').toLowerCase();
    
    console.log(`[Format Detection] Headers found:`, headers);
    console.log(`[Format Detection] Header string:`, headerString);
    
    // OE12 format detection - EventReg exports
    if (headerString.includes('oe0002_v12') || 
        (headerString.includes('entry id') && headerString.includes('chipno1') && headerString.includes('entry class (short)'))) {
      console.log(`[Format Detection] Detected OE12 format`);
      return 'OE12';
    }
    
    // Jotform format detection - look for specific Jotform/MeOS export columns
    if ((headerString.includes('stno') || headerString.includes('chip')) && 
        headerString.includes('cl.name') && 
        headerString.includes('short') && headerString.includes('long') &&
        headerString.includes('surname') && headerString.includes('first name')) {
      console.log(`[Format Detection] Detected Jotform format`);
      return 'Jotform';
    }
    
    // Default to Jotform for backward compatibility
    console.log(`[Format Detection] No match found, defaulting to Jotform`);
    return 'Jotform';
  }

  /**
   * Import entries from OE12 CSV data (EventReg format)
   */
  async importFromOE12(
    csvEntries: any[], 
    fileName?: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ entries: LocalEntry[], newCount: number, updatedCount: number }> {
    const processedEntries: LocalEntry[] = [];
    let newCount = 0;
    let updatedCount = 0;

    // Temporarily disable per-entry autosave during bulk import
    this.isImporting = true;
    
    // Set directory preference based on CSV filename
    if (fileName) {
      const baseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
      const directoryName = `${baseName} - MeOS Event`;
      this.setSaveDirectoryPreference(directoryName);
    }
    
    let i = 0;
    for (const csvEntry of csvEntries) {
      // Extract class information from OE12 CSV
      const csvClassName = csvEntry['Short'] || csvEntry['Long'] || csvEntry['Entry class (short)'] || csvEntry['Entry class (long)'] || '';
      const csvClassNumeric = csvEntry['Cl. no.'] || csvEntry['Entry cl. No'] || '';
      
      // Use MeOS class service to get the correct class ID
      let actualClassId: string;
      try {
        const classMapping = await meosClassService.getClassId(csvClassName, csvClassNumeric);
        actualClassId = classMapping.id.toString();
        console.log(`[OE12 Import] Mapped class "${csvClassName}" (Cl. no.: "${csvClassNumeric}") -> ID ${actualClassId} (${classMapping.method})`);
      } catch (error) {
        console.warn(`[OE12 Import] Failed to map class "${csvClassName}" (Cl. no.: "${csvClassNumeric}"), using fallback`, error);
        // Fallback mapping
        const fallbackMapping: Record<string, string> = {
          'Blue': '1', 'Brown': '2', 'Green': '3', 'Orange': '4', 
          'Red': '5', 'White': '6', 'Yellow': '7'
        };
        actualClassId = fallbackMapping[csvClassName] || csvClassNumeric || '1';
      }
      
      // Debug: Log the actual values before creating entryData
      console.log(`[OE12 Debug] Raw CSV entry values:`, {
        'First name': csvEntry['First name'],
        'Surname': csvEntry['Surname'],
        'YB': csvEntry['YB'],
        'S': csvEntry['S'],
        'City': csvEntry['City'],
        'Chipno1': csvEntry['Chipno1'],
        'Rented': csvEntry['Rented']
      });
      
      // Check rental/hired card status with debug info
      // In OE12 format: Rented='X' means needs rental card, Rented='0' means owns/hired card
      const rentedValue = csvEntry['Rented'] || csvEntry['rented'] || '';
      const cardNumber = csvEntry['Chipno1'] || csvEntry['Chipno2'] || csvEntry['Chipno3'] || csvEntry['Chipno4'] || csvEntry['Chipno5'] || csvEntry['Chipno6'] || '0';
      
      // Set needsRentalCard based on the Rented field
      const needsRentalCard = rentedValue === 'X';
      
      // If needsRentalCard is true, this IS a hired card that needs to be collected
      const isHired = needsRentalCard;
      
      console.log(`[OE12 Debug] Card info for ${csvEntry['First name']} ${csvEntry['Surname']}: CardNumber='${cardNumber}', Rented='${rentedValue}', needsRental=${needsRentalCard}, isHired=${isHired}`);
      
      // Check if this is a group entry for OE12
      const groupSizeOE12 = parseInt(csvEntry['Nat'] || '1');
      const isGroupOE12 = groupSizeOE12 >= 2;
      
      const entryData = {
        name: {
          first: this.capitalizeNamePart(csvEntry['First name'] || ''),
          last: isGroupOE12 ? '' : this.capitalizeNamePart(csvEntry['Surname'] || csvEntry['Family name'] || csvEntry['Last name'] || ''),
        },
        club: csvEntry['City'] || csvEntry['Cl.name'] || 'DVOA', // Club name is in City field for OE12
        birthYear: csvEntry['YB'] || csvEntry['Birth year'] || csvEntry['Year'] || '',
        sex: csvEntry['S'] || csvEntry['Sex'] || csvEntry['Gender'] || '',
        nationality: csvEntry['Nat'] || '',
        phone: csvEntry['Phone'] || csvEntry['Mobile'] || '',
        classId: actualClassId,
        className: csvClassName,
        cardNumber: csvEntry['Chipno1'] || csvEntry['Chipno2'] || csvEntry['Chipno3'] || csvEntry['Chipno4'] || csvEntry['Chipno5'] || csvEntry['Chipno6'] || '0',
        isHiredCard: isHired,
        needsRentalCard, // Pass the rental card flag
        fee: parseInt(csvEntry['Start fee'] || '0'),
        importedFrom: 'jotform' as const, // Keep as jotform for compatibility
      };
      
      console.log(`[OE12 Debug] Mapped entryData:`, entryData);
      
      const result = this.addOrUpdateEntry(entryData);
      processedEntries.push(result.entry);
      
      if (result.isNew) {
        newCount++;
      } else {
        updatedCount++;
      }

      i++;
      if (onProgress) {
        try { onProgress(i, csvEntries.length); } catch {}
      }
      // Yield to UI every 10 items
      if (i % 10 === 0) {
        await new Promise(res => setTimeout(res, 0));
      }
    }
    
    // Automatically learn from imported entries to build master runner database
    if (processedEntries.length > 0) {
      const { imported, updated } = localRunnerService.bulkLearnFromEntries(processedEntries);
      console.log(`[Runner Database] Auto-learned from OE12 import: ${imported} new runners, ${updated} updated`);
    }
    
    console.log(`Processed ${processedEntries.length} entries from OE12: ${newCount} new, ${updatedCount} updated`);

    // Re-enable autosave now that bulk import is complete
    this.isImporting = false;

    return { entries: processedEntries, newCount, updatedCount };
  }

  /**
   * Import entries from CSV data (Jotform format)
   */
  async importFromJotform(
    csvEntries: any[], 
    fileName?: string,
    onProgress?: (processed: number, total: number) => void
  ): Promise<{ entries: LocalEntry[], newCount: number, updatedCount: number }> {
    const processedEntries: LocalEntry[] = [];
    let newCount = 0;
    let updatedCount = 0;

    // Temporarily disable per-entry autosave during bulk import
    this.isImporting = true;
    
    // Set directory preference based on CSV filename
    if (fileName) {
      const baseName = fileName.replace(/\.[^/.]+$/, ''); // Remove extension
      const directoryName = `${baseName} - MeOS Event`;
      this.setSaveDirectoryPreference(directoryName);
    }
    
    let i = 0;
    for (const csvEntry of csvEntries) {
      // Extract class information from CSV - handle both formats
      const csvClassName = csvEntry['Short'] || csvEntry['Long'] || csvEntry.short || csvEntry.long || '';
      const csvClassId = csvEntry['Cl. no.'] || csvEntry.clNo || '';
      
      // Debug: Log the actual Jotform values before creating entryData
      console.log(`[Jotform Debug] Raw CSV entry values:`, {
        'Surname': csvEntry['Surname'],
        'First name': csvEntry['First name'], 
        'YB': csvEntry['YB'],
        'S': csvEntry['S'],
        'Cl.name': csvEntry['Cl.name'],
        'Chip': csvEntry['Chip'],
        'Short': csvEntry['Short'],
        'Long': csvEntry['Long'],
        'Cl. no.': csvEntry['Cl. no.'],
        'Phone': csvEntry['Phone'],
        'Start fee': csvEntry['Start fee'],
        'Rented': csvEntry['Rented']
      });
      
      // Use MeOS class service to get the correct class ID
      let actualClassId: string;
      try {
        const classMapping = await meosClassService.getClassId(csvClassName, csvClassId);
        actualClassId = classMapping.id.toString();
        console.log(`[Jotform Import] Mapped class "${csvClassName}" (Cl. no.: "${csvClassId}") -> ID ${actualClassId} (${classMapping.method})`);
      } catch (error) {
        console.warn(`[Jotform Import] Failed to map class "${csvClassName}" (Cl. no.: "${csvClassId}"), using fallback`, error);
        // Fallback mapping
        const fallbackMapping: Record<string, string> = {
          'Blue': '1', 'Brown': '2', 'Green': '3', 'Orange': '4', 
          'Red': '5', 'White': '6', 'Yellow': '7'
        };
        actualClassId = fallbackMapping[csvClassName] || fallbackMapping[csvClassId] || '1';
      }
      
      // Check hired card status with debug info
      const rentedValue = csvEntry['Rented'] || csvEntry.rented || csvEntry['Hired'] || csvEntry.hired;
      const isHired = (csvEntry['Rented'] && parseFloat(csvEntry['Rented']) > 0) || (csvEntry.rented && parseFloat(csvEntry.rented) > 0) || (csvEntry['Hired'] && parseFloat(csvEntry['Hired']) > 0) || (csvEntry.hired && parseFloat(csvEntry.hired) > 0) || false;
      console.log(`[Jotform Debug] Hired card check for ${csvEntry['First name'] || csvEntry.firstName} ${csvEntry['Surname'] || csvEntry.surname}: Rented='${rentedValue}', parsed=${rentedValue ? parseFloat(rentedValue) : 'N/A'}, isHired=${isHired}`);
      
      // Check if this is a group entry
      const groupSize = parseInt(csvEntry['Nat'] || csvEntry.nat || '1');
      const isGroup = groupSize >= 2;
      
      const entryData = {
        name: {
          first: this.capitalizeNamePart(csvEntry['First name'] || csvEntry.firstName || ''),
          last: isGroup ? '' : this.capitalizeNamePart(csvEntry['Surname'] || csvEntry.surname || ''),
        },
        club: csvEntry['Cl.name'] || csvEntry.clName || '',
        birthYear: csvEntry['YB'] || csvEntry.yb || '',
        sex: csvEntry['S'] || csvEntry.s || '',
        nationality: csvEntry['Nat'] || csvEntry.nat || '',
        phone: csvEntry['Phone'] || csvEntry.phone || '',
        classId: actualClassId,
        className: csvClassName,
        cardNumber: csvEntry['Chip'] || csvEntry.chip || '0',
        isHiredCard: isHired,
        fee: parseInt(csvEntry['Start fee'] || csvEntry.startFee || '0'),
        importedFrom: 'jotform' as const,
      };
      
      console.log(`[Jotform Debug] Mapped entryData:`, entryData);
      
      const result = this.addOrUpdateEntry(entryData);
      processedEntries.push(result.entry);
      
      if (result.isNew) {
        newCount++;
      } else {
        updatedCount++;
      }

      i++;
      if (onProgress) {
        try { onProgress(i, csvEntries.length); } catch {}
      }
      // Yield to UI every 10 items
      if (i % 10 === 0) {
        await new Promise(res => setTimeout(res, 0));
      }
    }
    
    // Automatically learn from imported entries to build master runner database
    if (processedEntries.length > 0) {
      const { imported, updated } = localRunnerService.bulkLearnFromEntries(processedEntries);
      console.log(`[Runner Database] Auto-learned from Jotform import: ${imported} new runners, ${updated} updated`);
    }
    
    console.log(`Processed ${processedEntries.length} entries from Jotform: ${newCount} new, ${updatedCount} updated`);

    // Re-enable autosave now that bulk import is complete
    this.isImporting = false;

    return { entries: processedEntries, newCount, updatedCount };
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    total: number;
    pending: number;
    checkedIn: number;
    needsAttention: number;
    needsCards: number;
    missingInfo: number;
    ready: number;
  } {
    const entries = this.getAllEntries();
    
    let pending = 0;
    let checkedIn = 0;
    let needsAttention = 0;
    let needsCards = 0;
    let missingInfo = 0;
    
    let ready = 0;
    
    entries.forEach(entry => {
      if (entry.status === 'pending') pending++;
      if (entry.status === 'checked-in') checkedIn++;
      
      const hasInfoIssues = entry.issues.missingBirthYear || entry.issues.missingSex || entry.issues.needsNameCapitalization;
      if (hasInfoIssues) needsAttention++;
      
      if (entry.issues.needsRentalCard || entry.issues.needsCardButNoRental) needsCards++;
      if (entry.issues.missingBirthYear || entry.issues.missingSex) missingInfo++;
      
      // Only count pending entries without any blocking issues as "ready" 
      if (entry.status === 'pending' && !hasInfoIssues && !entry.issues.needsRentalCard && !entry.issues.needsCardButNoRental) ready++;
    });
    
    return {
      total: entries.length,
      pending,
      checkedIn,
      needsAttention,
      needsCards,
      missingInfo,
      ready,
    };
  }

  /**
   * Get local statistics for dashboard
   */
  getLocalStats(): {
    totalEntries: number;
    readyEntries: number;
    checkedInEntries: number;
    hasIssues: number;
    cardsNeeded: number;
  } {
    const stats = this.getStatistics();
    return {
      totalEntries: stats.total,
      readyEntries: stats.ready,
      checkedInEntries: stats.checkedIn,
      hasIssues: stats.needsAttention,
      cardsNeeded: stats.needsCards
    };
  }

  /**
   * Auto-backup to file (if File System API is supported)
   */
  private async autoBackupToFile(entries: LocalEntry[]): Promise<void> {
    // Skip auto-backup during imports to avoid spamming files
    if (this.isImporting) {
      return;
    }
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '_').substring(0, 19);
      const filename = `meos_entries_autosave_${timestamp}.json`;
      
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        totalEntries: entries.length,
        autoSave: true,
        entries: entries
      };
      
      const dataStr = JSON.stringify(exportData, null, 2);
      
      // Try using File System Access API first (Chrome/Edge)
      if ('showSaveFilePicker' in window && this.workingDirectoryHandle) {
        try {
          const fileHandle = await this.workingDirectoryHandle.getFileHandle(filename, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(dataStr);
          await writable.close();
          
          console.log(`[AutoSave] Saved ${entries.length} entries to ${this.workingDirectoryHandle.name}/${filename}`);
          
          // Clean up old auto-save files (keep only last 5)
          await this.cleanupOldAutoSaves();
          return;
        } catch (dirError) {
          console.warn('[AutoSave] Working directory save failed:', dirError);
        }
      }
      
      // Fallback: Store in localStorage with rotation
      this.rotateLocalStorageBackups(dataStr, filename);
      console.log(`[AutoSave] Stored backup in localStorage: ${filename}`);
      
    } catch (error) {
      console.warn('[AutoSave] Auto-backup failed:', error);
    }
  }
  
  private isImporting: boolean = false;
  
  /**
   * Clean up old auto-save files to prevent directory clutter
   */
  private async cleanupOldAutoSaves(): Promise<void> {
    if (!this.workingDirectoryHandle) return;
    
    try {
      const autoSaveFiles: { name: string, handle: any }[] = [];
      
      // @ts-ignore - FileSystemDirectoryHandle iteration
      for await (const [name, handle] of this.workingDirectoryHandle.entries()) {
        if (name.startsWith('meos_entries_autosave_') && name.endsWith('.json')) {
          autoSaveFiles.push({ name, handle });
        }
      }
      
      // Sort by name (which includes timestamp) and keep only the latest 5
      autoSaveFiles.sort((a, b) => b.name.localeCompare(a.name));
      
      if (autoSaveFiles.length > 5) {
        const filesToDelete = autoSaveFiles.slice(5);
        for (const file of filesToDelete) {
          try {
            await this.workingDirectoryHandle.removeEntry(file.name);
            console.log(`[AutoSave] Cleaned up old backup: ${file.name}`);
          } catch (error) {
            console.warn(`[AutoSave] Could not delete ${file.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('[AutoSave] Cleanup failed:', error);
    }
  }
  
  /**
   * Rotate localStorage backups (fallback when file system not available)
   */
  private rotateLocalStorageBackups(dataStr: string, filename: string): void {
    const maxBackups = 3;
    
    // Rotate existing backups
    for (let i = maxBackups - 1; i > 0; i--) {
      const oldKey = `meos_autosave_${i}`;
      const newKey = `meos_autosave_${i + 1}`;
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        localStorage.setItem(newKey, oldData);
      }
    }
    
    // Store new backup
    localStorage.setItem('meos_autosave_1', JSON.stringify({
      filename,
      data: dataStr,
      timestamp: new Date().toISOString()
    }));
    
    // Remove oldest backup
    localStorage.removeItem(`meos_autosave_${maxBackups + 1}`);
  }

  /**
   * Recover from backup if main storage fails
   */
  private recoverFromBackup(): LocalEntry[] {
    try {
      const backup = localStorage.getItem(this.BACKUP_KEY);
      if (backup) {
        const entries = JSON.parse(backup);
        console.warn('[LocalStorage] Recovered from backup data');
        localStorage.setItem(this.STORAGE_KEY, backup);
        return entries;
      }
    } catch (error) {
      console.error('Backup recovery failed:', error);
    }
    return [];
  }

  /**
   * Export entries to user-selected file location (defaults to last import directory)
   */
  async exportToFile(filename?: string): Promise<void> {
    const entries = this.getAllEntries();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '_');
    const defaultFilename = filename || `meos_entries_${timestamp}.json`;
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      totalEntries: entries.length,
      entries: entries
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);

    // Electron: save directly to the known working directory (no prompt)
    try {
      const isElectron = typeof (window as any).process !== 'undefined' && !!(window as any).process.versions?.electron;
      const hasNodeRequire = typeof (window as any).require === 'function';
      const workingDirPath = this.getWorkingDirectoryPath();
      if (isElectron && hasNodeRequire && workingDirPath) {
        const path = (window as any).require('path');
        const { ipcRenderer } = (window as any).require('electron');
        const fullPath = path.join(workingDirPath, defaultFilename);
        const result = await ipcRenderer.invoke('save-file', fullPath, dataStr);
        if (result?.success) {
          console.log(`[LocalStorage] Exported ${entries.length} entries to ${fullPath} (Electron)`);
          return;
        } else if (result?.error) {
          console.warn('[LocalStorage] Electron save-file failed:', result.error);
        }
      }
    } catch (e) {
      console.warn('[LocalStorage] Electron direct save unavailable, falling back:', e);
    }
    
    // Try using File System Access API first (Chrome/Edge)
    if ('showSaveFilePicker' in window) {
      try {
        // If we have a working directory, save directly there
        if (this.workingDirectoryHandle) {
          try {
            const fileHandle = await this.workingDirectoryHandle.getFileHandle(defaultFilename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            
            console.log(`[LocalStorage] Exported ${entries.length} entries to ${this.workingDirectoryHandle.name}/${defaultFilename}`);
            return;
          } catch (dirError) {
            console.warn('Working directory save failed, falling back to picker:', dirError);
            // Fall through to show picker
          }
        }
        
        // Show file picker as fallback or if no working directory
        const preferredDir = this.getSaveDirectoryPreference();
        console.log(`[LocalStorage] Will suggest directory: ${preferredDir}`);
        
        const options: any = {
          suggestedName: defaultFilename,
          types: [
            {
              description: 'JSON files',
              accept: {
                'application/json': ['.json'],
              },
            },
          ],
          // If we remember the CSV file handle, start the save picker in that folder
          startIn: (this as any).workingFileHandle || 'documents'
        };
        
        const fileHandle = await (window as any).showSaveFilePicker(options);
        
        const writable = await fileHandle.createWritable();
        await writable.write(dataStr);
        await writable.close();
        
        console.log(`[LocalStorage] Exported ${entries.length} entries to ${fileHandle.name}`);
        return;
      } catch (error) {
        // User cancelled or API failed, fall back to download
        if (error && typeof error === 'object' && 'name' in error && error.name !== 'AbortError') {
          console.warn('File System Access API failed, falling back to download:', error);
        } else {
          // User cancelled
          console.log('[LocalStorage] Export cancelled by user');
          return;
        }
      }
    }
    
    // Fallback: Create download link (older browsers or API unavailable)
    console.log('[LocalStorage] Using download fallback (File System Access API not available)');
    
    const workingDirPath = this.getWorkingDirectoryPath();
    const preferredDir = this.getSaveDirectoryPreference();
    
    if (workingDirPath) {
      console.log(`[LocalStorage] FIREFOX USER: Please move the downloaded file to your working directory:`);
      console.log(`[LocalStorage] Move ${defaultFilename} to: ${workingDirPath}`);
    } else {
      console.log(`[LocalStorage] Suggestion: Create a folder named "${preferredDir}" in your Documents folder for easy organization`);
      console.log(`[LocalStorage] Full suggested path: Documents\\${preferredDir}\\${defaultFilename}`);
    }
    
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`[LocalStorage] Downloaded ${entries.length} entries as ${defaultFilename}`);
  }

  /**
   * Import entries from JSON file with MeOS status checking
   */
  async importFromFile(file: File): Promise<{ imported: number, errors: string[], meosUpdated: number, meosChecked: boolean }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);
          
          let entries: LocalEntry[];
          let errors: string[] = [];
          
          // Handle different import formats
          if (data.entries && Array.isArray(data.entries)) {
            // Our export format
            entries = data.entries;
          } else if (Array.isArray(data)) {
            // Direct array format
            entries = data;
          } else {
            throw new Error('Invalid file format');
          }
          
          console.log(`[JSON Import] Processing ${entries.length} entries from backup file`);
          
          // Set importing flag to prevent auto-save spam
          this.isImporting = true;
          
          // Try to get current MeOS entries for status checking
          let meosEntries: any[] = [];
          let meosChecked = false;
          
          try {
            const { meosApi } = await import('./meosApi');
            console.log('[JSON Import] Checking MeOS connection for status sync...');
            
            const isConnected = await meosApi.testConnection();
            if (isConnected) {
              meosEntries = await meosApi.getAllEntries();
              meosChecked = true;
              console.log(`[JSON Import] Retrieved ${meosEntries.length} entries from MeOS for status comparison`);
            } else {
              console.log('[JSON Import] MeOS not available, skipping status sync');
            }
          } catch (meosError) {
            console.warn('[JSON Import] Could not check MeOS status:', meosError);
          }
          
          // Validate and import entries with MeOS status checking
          let imported = 0;
          let meosUpdated = 0;
          
          for (let index = 0; index < entries.length; index++) {
            const entry = entries[index];
            try {
              // Ensure required fields exist
              if (!entry.name?.first && !entry.name?.last) {
                errors.push(`Entry ${index + 1}: Missing name`);
                continue;
              }
              
              // Convert date strings back to Date objects
              let processedEntry: LocalEntry = {
                ...entry,
                importedAt: new Date(entry.importedAt || new Date()),
                checkedInAt: entry.checkedInAt ? new Date(entry.checkedInAt) : undefined,
                submittedToMeosAt: entry.submittedToMeosAt ? new Date(entry.submittedToMeosAt) : undefined,
                // Ensure issues field exists (will be recalculated by importEntry)
                issues: entry.issues || {
                  needsRentalCard: false,
                  missingBirthYear: false,
                  missingSex: false,
                  placeholderCard: false,
                  needsNameCapitalization: false
                }
              };
              
              console.log(`[JSON Import] Processing entry ${index + 1}/${entries.length}: ${processedEntry.name.first} ${processedEntry.name.last} (status: ${processedEntry.status})`);
              
              // Check if this runner exists in MeOS with a different status
              if (meosChecked && meosEntries.length > 0) {
                const meosEntry = this.findMatchingMeosEntry(processedEntry, meosEntries);
                
                if (meosEntry) {
                  console.log(`[JSON Import] Found ${processedEntry.name.first} ${processedEntry.name.last} in MeOS:`, {
                    status: meosEntry.status,
                    cardNumber: meosEntry.cardNumber,
                    class: meosEntry.class
                  });
                  
                  // Update status based on MeOS data
                  const updatedEntry = this.syncWithMeosEntry(processedEntry, meosEntry);
                  if (updatedEntry !== processedEntry) {
                    processedEntry = updatedEntry;
                    meosUpdated++;
                    console.log(`[JSON Import] Updated ${processedEntry.name.first} ${processedEntry.name.last} status from MeOS`);
                  }
                }
              }
              
              this.importEntry(processedEntry);
              imported++;
            } catch (entryError) {
              errors.push(`Entry ${index + 1}: ${entryError}`);
            }
          }
          
          console.log(`[JSON Import] Import complete: ${imported} imported, ${meosUpdated} updated from MeOS`);
          
          // Clear importing flag and do one final auto-save
          this.isImporting = false;
          if (imported > 0) {
            const allEntries = this.getAllEntries();
            await this.autoBackupToFile(allEntries);
          }
          
          resolve({ imported, errors, meosUpdated, meosChecked });
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /**
   * Find matching MeOS entry for a local entry
   */
  private findMatchingMeosEntry(localEntry: LocalEntry, meosEntries: any[]): any | null {
    // Try to match by name and club first (most reliable)
    const nameMatch = meosEntries.find(meosEntry => {
      const firstNameMatch = this.normalizeForComparison(meosEntry.name?.first || '') === 
                             this.normalizeForComparison(localEntry.name.first);
      const lastNameMatch = this.normalizeForComparison(meosEntry.name?.last || '') === 
                            this.normalizeForComparison(localEntry.name.last);
      const clubMatch = this.normalizeForComparison(meosEntry.club || '') === 
                       this.normalizeForComparison(localEntry.club);
      
      // Require exact name match, club match is optional but helpful
      if (firstNameMatch && lastNameMatch) {
        // If clubs match exactly, this is very likely the same person
        if (clubMatch) return true;
        
        // If birth years match, also likely the same person
        if (localEntry.birthYear && meosEntry.birthYear) {
          return localEntry.birthYear === meosEntry.birthYear;
        }
        
        // If no birth year available, accept name match as sufficient
        return true;
      }
      
      return false;
    });
    
    return nameMatch || null;
  }
  
  /**
   * Normalize string for comparison (lowercase, trim, handle spacing)
   */
  private normalizeForComparison(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
  }
  
  /**
   * Sync local entry with MeOS entry data
   */
  private syncWithMeosEntry(localEntry: LocalEntry, meosEntry: any): LocalEntry {
    const updatedEntry = { ...localEntry };
    let hasChanges = false;
    
    // Check if runner is already in MeOS (has been submitted)
    const isInMeos = meosEntry.status === 'OK' || meosEntry.id;
    
    if (isInMeos) {
      // Mark as submitted to MeOS if not already marked
      if (!updatedEntry.submittedToMeosAt) {
        updatedEntry.submittedToMeosAt = new Date();
        updatedEntry.status = 'checked-in';
        updatedEntry.checkedInAt = updatedEntry.checkedInAt || new Date();
        hasChanges = true;
        console.log(`[MeOS Sync] Marking ${localEntry.name.first} ${localEntry.name.last} as submitted (found in MeOS)`);
      }
      
      // Update card number if MeOS has a different/better one
      if (meosEntry.cardNumber && meosEntry.cardNumber !== '0' && 
          (!updatedEntry.cardNumber || updatedEntry.cardNumber === '0')) {
        console.log(`[MeOS Sync] Updating card number for ${localEntry.name.first} ${localEntry.name.last}: ${updatedEntry.cardNumber} -> ${meosEntry.cardNumber}`);
        updatedEntry.cardNumber = meosEntry.cardNumber;
        hasChanges = true;
      }
      
      // Update class if MeOS has different class assignment
      if (meosEntry.class && meosEntry.class.name && 
          meosEntry.class.name !== updatedEntry.className) {
        console.log(`[MeOS Sync] Updating class for ${localEntry.name.first} ${localEntry.name.last}: ${updatedEntry.className} -> ${meosEntry.class.name}`);
        updatedEntry.className = meosEntry.class.name;
        updatedEntry.classId = meosEntry.class.id || updatedEntry.classId;
        hasChanges = true;
      }
      
      // Store MeOS entry ID for future reference
      if (meosEntry.id && !updatedEntry.meosEntryId) {
        updatedEntry.meosEntryId = meosEntry.id;
        hasChanges = true;
      }
    }
    
    return hasChanges ? updatedEntry : localEntry;
  }
  
  /**
   * Get backup information
   */
  getBackupInfo(): { hasBackup: boolean, backupSize: number, lastBackupTime?: string } {
    const backup = localStorage.getItem(this.BACKUP_KEY);
    return {
      hasBackup: !!backup,
      backupSize: backup ? backup.length : 0,
      // Note: We don't store backup timestamp, but could add this feature
    };
  }

  /**
   * Get available rollback points
   */
  getRollbackPoints(): { id: string, filename: string, timestamp: string, entryCount: number }[] {
    const rollbackPoints = [];
    
    // Check main backup
    const mainBackup = localStorage.getItem(this.BACKUP_KEY);
    if (mainBackup) {
      try {
        const entries = JSON.parse(mainBackup);
        rollbackPoints.push({
          id: 'main_backup',
          filename: 'Previous State',
          timestamp: 'Before last save',
          entryCount: entries.length
        });
      } catch (error) {
        console.warn('Invalid main backup data');
      }
    }
    
    // Check auto-save backups
    for (let i = 1; i <= 3; i++) {
      const autoSaveData = localStorage.getItem(`meos_autosave_${i}`);
      if (autoSaveData) {
        try {
          const backup = JSON.parse(autoSaveData);
          const data = JSON.parse(backup.data);
          rollbackPoints.push({
            id: `autosave_${i}`,
            filename: backup.filename,
            timestamp: new Date(backup.timestamp).toLocaleString(),
            entryCount: data.entries.length
          });
        } catch (error) {
          console.warn(`Invalid auto-save backup ${i}`);
        }
      }
    }
    
    return rollbackPoints;
  }
  
  /**
   * Rollback to a previous state
   */
  async rollbackTo(rollbackId: string): Promise<{ success: boolean, message: string, entriesRestored: number }> {
    try {
      let dataToRestore: string | null = null;
      
      if (rollbackId === 'main_backup') {
        dataToRestore = localStorage.getItem(this.BACKUP_KEY);
      } else if (rollbackId.startsWith('autosave_')) {
        const autoSaveData = localStorage.getItem(rollbackId);
        if (autoSaveData) {
          const backup = JSON.parse(autoSaveData);
          const parsedData = JSON.parse(backup.data);
          dataToRestore = JSON.stringify(parsedData.entries);
        }
      }
      
      if (!dataToRestore) {
        return { success: false, message: 'Rollback point not found', entriesRestored: 0 };
      }
      
      // Create a backup of current state before rollback
      const currentEntries = localStorage.getItem(this.STORAGE_KEY);
      if (currentEntries) {
        localStorage.setItem('meos_pre_rollback_backup', currentEntries);
      }
      
      // Restore the data
      const entriesToRestore = JSON.parse(dataToRestore);
      localStorage.setItem(this.STORAGE_KEY, dataToRestore);
      
      // Create an auto-save of the restored state
      this.isImporting = true; // Temporarily prevent auto-save during restore
      await this.autoBackupToFile(entriesToRestore);
      this.isImporting = false;
      
      return {
        success: true,
        message: `Successfully restored ${entriesToRestore.length} entries`,
        entriesRestored: entriesToRestore.length
      };
      
    } catch (error) {
      console.error('Rollback failed:', error);
      return { success: false, message: 'Rollback failed due to data corruption', entriesRestored: 0 };
    }
  }
  
  /**
   * Migrate existing entries: ensure isHiredCard is true when needsRentalCard is true
   */
  migrateRentalCardFlags(): { updated: number } {
    const entries = this.getAllEntries();
    let updatedCount = 0;
    
    const updatedEntries = entries.map(entry => {
      // If needsRentalCard is true but isHiredCard is false, fix it
      if (entry.issues?.needsRentalCard && !entry.isHiredCard) {
        updatedCount++;
        console.log(`[Migration] Fixing ${entry.name.first} ${entry.name.last}: needsRentalCard=true but isHiredCard=false`);
        return {
          ...entry,
          isHiredCard: true
        };
      }
      return entry;
    });
    
    if (updatedCount > 0) {
      this.saveEntries(updatedEntries);
      console.log(`[Migration] Updated isHiredCard flag for ${updatedCount} entries`);
    }
    
    return { updated: updatedCount };
  }

  /**
   * Recalculate issues for all entries (useful after logic changes)
   */
  recalculateAllIssues(): { updated: number, entries: LocalEntry[] } {
    const entries = this.getAllEntries();
    let updatedCount = 0;
    
    const updatedEntries = entries.map(entry => {
      const newIssues = this.calculateIssues(entry);
      
      // Check if issues actually changed
      const issuesChanged = JSON.stringify(entry.issues) !== JSON.stringify(newIssues);
      
      if (issuesChanged) {
        updatedCount++;
        console.log(`[Recalculate] Updated issues for ${entry.name.first} ${entry.name.last}:`, {
          old: entry.issues,
          new: newIssues
        });
      }
      
      return {
        ...entry,
        issues: newIssues
      };
    });
    
    this.saveEntries(updatedEntries);
    console.log(`[Recalculate] Updated issues for ${updatedCount} entries`);
    
    return { updated: updatedCount, entries: updatedEntries };
  }

  /**
   * Clear all local entries (use with caution!)
   */
  clearAllEntries(): void {
    const backup = localStorage.getItem(this.STORAGE_KEY);
    if (backup) {
      localStorage.setItem(this.BACKUP_KEY, backup);
    }
    localStorage.removeItem(this.STORAGE_KEY);
  }
}

export const localEntryService = new LocalEntryService();
export default LocalEntryService;