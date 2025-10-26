// Simple Local Runner Database Service
// Stores runner data locally in browser storage for auto-completion

export interface LocalRunner {
  id: string;
  name: {
    first: string;
    last: string;
  };
  club: string;
  birthYear?: number;
  sex?: 'M' | 'F';
  cardNumber?: number;
  nationality?: string;
  phone?: string;
  email?: string;
  lastUsed: Date;
  timesUsed: number;
}

class LocalRunnerService {
  private readonly STORAGE_KEY = 'local_runner_database';
  private readonly CLOUD_PATH_KEY = 'runner_database_cloud_path';
  private readonly DEFAULT_CLOUD_PATH = 'C:\\Users\\drads\\OneDrive\\DVOA\\DVOA MeOS Advanced\\runner_database.json';
  private runners: LocalRunner[] = [];
  private cloudPath: string;
  private autoSaveEnabled: boolean = true;

  constructor() {
    // Load cloud path preference
    this.cloudPath = localStorage.getItem(this.CLOUD_PATH_KEY) || this.DEFAULT_CLOUD_PATH;
    this.loadRunners();
    
    // Listen for external localStorage changes (e.g., from database manager)
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === this.STORAGE_KEY && e.newValue !== null) {
          this.loadRunners();
        }
      });
      
      // Also listen for custom events (for same-tab updates)
      window.addEventListener('localRunnerDatabaseUpdate', () => {
        this.loadRunners();
      });
    }
  }

  /**
   * Load runners from localStorage
   */
  private loadRunners(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        this.runners = data.map((runner: any) => ({
          ...runner,
          lastUsed: new Date(runner.lastUsed)
        }));
      }
    } catch (error) {
      this.runners = [];
    }
  }

  /**
   * Refresh runners from localStorage (public method to reload data)
   */
  refreshFromStorage(): void {
    this.loadRunners();
  }
  /**
   * Save runners to localStorage and cloud file with validation
   */
  private saveRunners(): void {
    try {
      // Validate runner count before saving
      if (this.runners.length === 0) {
      }
      
      // Create backup in localStorage before overwriting (keeps last 3 backups)
      this.createBackup();
      
      // Save to localStorage
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.runners));
      
      // Auto-save to cloud if enabled
      if (this.autoSaveEnabled) {
        this.saveToCloudWithValidation();
      }
    } catch (error) {
    }
  }

  /**
   * Create a timestamped backup in localStorage (keeps last 3)
   */
  private createBackup(): void {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupKey = `${this.STORAGE_KEY}_backup_${timestamp}`;
      
      // Save current data as backup
      if (this.runners.length > 0) {
        localStorage.setItem(backupKey, JSON.stringify(this.runners));
      }
      
      // Clean up old backups (keep only last 3)
      const allKeys = Object.keys(localStorage);
      const backupKeys = allKeys
        .filter(k => k.startsWith(`${this.STORAGE_KEY}_backup_`))
        .sort()
        .reverse(); // Newest first
      
      // Remove old backups (keep only 3 most recent)
      if (backupKeys.length > 3) {
        backupKeys.slice(3).forEach(key => {
          localStorage.removeItem(key);
        });
      }
    } catch (error) {
    }
  }

  /**
   * List available backups
   */
  listBackups(): string[] {
    const allKeys = Object.keys(localStorage);
    return allKeys
      .filter(k => k.startsWith(`${this.STORAGE_KEY}_backup_`))
      .sort()
      .reverse();
  }

  /**
   * Restore from a backup
   */
  restoreFromBackup(backupKey: string): boolean {
    try {
      const backup = localStorage.getItem(backupKey);
      if (!backup) {
        return false;
      }
      
      const backupData = JSON.parse(backup);
      
      // Save current data as emergency backup before restore
      if (this.runners.length > 0) {
        const emergencyKey = `${this.STORAGE_KEY}_emergency_before_restore`;
        localStorage.setItem(emergencyKey, JSON.stringify(this.runners));
      }
      
      // Restore the backup
      this.runners = backupData.map((runner: any) => ({
        ...runner,
        lastUsed: new Date(runner.lastUsed)
      }));
      
      this.saveRunners();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Search for runners by name
   */
  searchRunners(searchName: string): LocalRunner[] {
    const searchTerm = searchName.toLowerCase().trim();
    if (searchTerm.length < 2) return [];

    return this.runners
      .filter(runner => {
        const fullName = `${runner.name.first} ${runner.name.last}`.toLowerCase();
        const firstNameMatch = runner.name.first.toLowerCase().includes(searchTerm);
        const lastNameMatch = runner.name.last.toLowerCase().includes(searchTerm);
        const fullNameMatch = fullName.includes(searchTerm);
        
        return firstNameMatch || lastNameMatch || fullNameMatch;
      })
      .sort((a, b) => {
        // Sort by relevance and usage frequency
        const aFullName = `${a.name.first} ${a.name.last}`.toLowerCase();
        const bFullName = `${b.name.first} ${b.name.last}`.toLowerCase();
        
        // Exact matches first
        if (aFullName === searchTerm && bFullName !== searchTerm) return -1;
        if (bFullName === searchTerm && aFullName !== searchTerm) return 1;
        
        // Then by times used (more frequently used first)
        if (a.timesUsed !== b.timesUsed) {
          return b.timesUsed - a.timesUsed;
        }
        
        // Finally by last used
        return b.lastUsed.getTime() - a.lastUsed.getTime();
      })
      .slice(0, 10); // Limit to top 10 results
  }

  /**
   * Search for a runner by card number
   */
  searchByCardNumber(cardNumber: number | string): LocalRunner | null {
    const cardNum = typeof cardNumber === 'string' ? parseInt(cardNumber) : cardNumber;
    if (!cardNum || isNaN(cardNum)) return null;

    const runner = this.runners.find(r => r.cardNumber === cardNum);
    if (runner) {
      return runner;
    }
    return null;
  }

  /**
   * Add or update a runner record
   */
  addRunner(runnerData: Omit<LocalRunner, 'id' | 'lastUsed' | 'timesUsed'>): LocalRunner {
    // Check for existing runner
    const existingRunner = this.runners.find(r => 
      r.name.first.toLowerCase() === runnerData.name.first.toLowerCase() &&
      r.name.last.toLowerCase() === runnerData.name.last.toLowerCase()
    );

    if (existingRunner) {
      // Update existing runner
      existingRunner.club = runnerData.club || existingRunner.club;
      existingRunner.birthYear = runnerData.birthYear || existingRunner.birthYear;
      existingRunner.sex = runnerData.sex || existingRunner.sex;
      existingRunner.cardNumber = runnerData.cardNumber || existingRunner.cardNumber;
      existingRunner.nationality = runnerData.nationality || existingRunner.nationality;
      existingRunner.phone = runnerData.phone || existingRunner.phone;
      existingRunner.email = runnerData.email || existingRunner.email;
      existingRunner.lastUsed = new Date();
      existingRunner.timesUsed += 1;
      
      this.saveRunners();
      return existingRunner;
    } else {
      // Add new runner
      const newRunner: LocalRunner = {
        ...runnerData,
        id: `runner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        lastUsed: new Date(),
        timesUsed: 1,
      };
      this.runners.push(newRunner);
      this.saveRunners();
      return newRunner;
    }
  }

  /**
   * Record usage of a runner (when they're selected for auto-completion)
   */
  recordUsage(runnerId: string): void {
    const runner = this.runners.find(r => r.id === runnerId);
    if (runner) {
      runner.lastUsed = new Date();
      runner.timesUsed += 1;
      this.saveRunners();
    }
  }

  /**
   * Get all runners (for management)
   */
  getAllRunners(): LocalRunner[] {
    return [...this.runners].sort((a, b) => 
      `${a.name.first} ${a.name.last}`.localeCompare(`${b.name.first} ${b.name.last}`)
    );
  }

  /**
   * Import runners from entries (learn from manual entries)
   * Never learns from group entries (nationality > 1)
   */
  learnFromEntry(entry: any): void {
    if (!entry.name?.first || !entry.name?.last) return;
    
    // Skip group entries - they should never be in the runner database
    const natNum = parseInt(entry.nationality || '0', 10);
    if (natNum > 1) {
      console.log(`[LocalRunner] Skipping group entry: ${entry.name.first} ${entry.name.last} (nationality=${natNum})`);
      return;
    }

    const runnerData = {
      name: {
        first: entry.name.first.trim(),
        last: entry.name.last.trim(),
      },
      club: entry.club?.trim() || '',
      birthYear: entry.birthYear ? parseInt(entry.birthYear.toString()) : undefined,
      sex: entry.sex as 'M' | 'F' | undefined,
      cardNumber: entry.cardNumber ? parseInt(entry.cardNumber.toString()) : undefined,
      phone: entry.phone?.trim() || '',
      nationality: entry.nationality?.trim() || '',
    };

    // Only learn if we have some meaningful data beyond just name and club
    if (runnerData.birthYear || runnerData.sex || runnerData.cardNumber || runnerData.phone) {
      this.addRunner(runnerData);
    }
  }

  /**
   * Update an existing runner
   */
  updateRunner(runnerId: string, updates: Partial<Omit<LocalRunner, 'id' | 'lastUsed' | 'timesUsed'>>): LocalRunner | null {
    const runnerIndex = this.runners.findIndex(r => r.id === runnerId);
    if (runnerIndex === -1) {
      console.warn(`[LocalRunner] Runner with ID ${runnerId} not found`);
      return null;
    }

    const runner = this.runners[runnerIndex];
    
    // Update fields if provided
    if (updates.name) {
      runner.name = updates.name;
    }
    if (updates.club !== undefined) {
      runner.club = updates.club;
    }
    if (updates.birthYear !== undefined) {
      runner.birthYear = updates.birthYear;
    }
    if (updates.sex !== undefined) {
      runner.sex = updates.sex;
    }
    if (updates.cardNumber !== undefined) {
      runner.cardNumber = updates.cardNumber;
    }
    if (updates.nationality !== undefined) {
      runner.nationality = updates.nationality;
    }
    if (updates.phone !== undefined) {
      runner.phone = updates.phone;
    }
    if (updates.email !== undefined) {
      runner.email = updates.email;
    }

    // Update last used timestamp
    runner.lastUsed = new Date();

    this.saveRunners();
    console.log(`[LocalRunner] Updated runner: ${runner.name.first} ${runner.name.last}`);
    return runner;
  }

  /**
   * Delete a runner
   */
  deleteRunner(runnerId: string): boolean {
    const runnerIndex = this.runners.findIndex(r => r.id === runnerId);
    if (runnerIndex === -1) {
      console.warn(`[LocalRunner] Runner with ID ${runnerId} not found`);
      return false;
    }

    const runner = this.runners[runnerIndex];
    this.runners.splice(runnerIndex, 1);
    this.saveRunners();
    console.log(`[LocalRunner] Deleted runner: ${runner.name.first} ${runner.name.last}`);
    return true;
  }

  /**
   * Clear all runners
   */
  clearAllRunners(): void {
    this.runners = [];
    this.saveRunners();
    console.log('[LocalRunner] Cleared all runners');
  }

  /**
   * Alternative method name for compatibility
   */
  clearAll(): void {
    this.clearAllRunners();
  }

  /**
   * Bulk import runners from CSV data (when entries are imported)
   * Never learns from group entries (nationality > 1)
   */
  bulkLearnFromEntries(entries: any[]): { imported: number, updated: number } {
    let imported = 0;
    let updated = 0;
    let skippedGroups = 0;
    const initialCount = this.runners.length;

    console.log(`[LocalRunner] Learning from ${entries.length} imported entries...`);

    entries.forEach(entry => {
      if (!entry.name?.first || !entry.name?.last) return;
      
      // Skip group entries - they should never be in the runner database
      const natNum = parseInt(entry.nationality || '0', 10);
      if (natNum > 1) {
        skippedGroups++;
        return;
      }

      const runnerData = {
        name: {
          first: entry.name.first.trim(),
          last: entry.name.last.trim(),
        },
        club: entry.club?.trim() || '',
        birthYear: entry.birthYear ? parseInt(entry.birthYear.toString()) : undefined,
        sex: entry.sex as 'M' | 'F' | undefined,
        cardNumber: entry.cardNumber ? parseInt(entry.cardNumber.toString()) : undefined,
        phone: entry.phone?.trim() || '',
        nationality: entry.nationality?.trim() || '',
        email: entry.email?.trim() || '',
      };

      // Learn even if minimal data - imported entries are valuable
      const existingRunner = this.runners.find(r => 
        r.name.first.toLowerCase() === runnerData.name.first.toLowerCase() &&
        r.name.last.toLowerCase() === runnerData.name.last.toLowerCase()
      );

      if (existingRunner) {
        // Update with new data if available
        let hasUpdates = false;
        if (runnerData.club && !existingRunner.club) {
          existingRunner.club = runnerData.club;
          hasUpdates = true;
        }
        if (runnerData.birthYear && !existingRunner.birthYear) {
          existingRunner.birthYear = runnerData.birthYear;
          hasUpdates = true;
        }
        if (runnerData.sex && !existingRunner.sex) {
          existingRunner.sex = runnerData.sex;
          hasUpdates = true;
        }
        if (runnerData.cardNumber && !existingRunner.cardNumber) {
          existingRunner.cardNumber = runnerData.cardNumber;
          hasUpdates = true;
        }
        if (runnerData.phone && !existingRunner.phone) {
          existingRunner.phone = runnerData.phone;
          hasUpdates = true;
        }
        if (runnerData.email && !existingRunner.email) {
          existingRunner.email = runnerData.email;
          hasUpdates = true;
        }
        if (hasUpdates) {
          existingRunner.lastUsed = new Date();
          updated++;
        }
      } else {
        // Add new runner
        const newRunner: LocalRunner = {
          ...runnerData,
          id: `runner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          lastUsed: new Date(),
          timesUsed: 0, // Don't increment usage for bulk import
        };
        this.runners.push(newRunner);
        imported++;
      }
    });

    if (imported > 0 || updated > 0) {
      this.saveRunners();
      console.log(`[LocalRunner] Bulk import complete: ${imported} new, ${updated} updated${skippedGroups > 0 ? `, ${skippedGroups} groups skipped` : ''}`);
    }

    return { imported, updated };
  }

  /**
   * Export runner database to JSON format (for portability)
   */
  exportDatabase(): string {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '2.0',
      platform: 'MeOS-Entry-Build',
      totalRunners: this.runners.length,
      runners: this.runners.map(runner => ({
        ...runner,
        lastUsed: runner.lastUsed.toISOString()
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import runner database from JSON format (for portability)
   */
  importDatabase(jsonData: string, mode: 'merge' | 'replace' = 'merge'): { imported: number, updated: number, errors: string[] } {
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;

    try {
      const data = JSON.parse(jsonData);
      
      if (!data.runners || !Array.isArray(data.runners)) {
        throw new Error('Invalid format: missing runners array');
      }

      // If replace mode, clear existing data
      if (mode === 'replace') {
        this.runners = [];
        console.log('[LocalRunner] Cleared existing database for replacement');
      }

      console.log(`[LocalRunner] Importing ${data.runners.length} runners in ${mode} mode...`);

      data.runners.forEach((runnerData: any, index: number) => {
        try {
          if (!runnerData.name?.first || !runnerData.name?.last) {
            errors.push(`Runner ${index + 1}: Missing name`);
            return;
          }

          const existingRunner = this.runners.find(r => 
            r.name.first.toLowerCase() === runnerData.name.first.toLowerCase() &&
            r.name.last.toLowerCase() === runnerData.name.last.toLowerCase()
          );

          if (existingRunner && mode === 'merge') {
            // Update existing runner with imported data
            existingRunner.club = runnerData.club || existingRunner.club;
            existingRunner.birthYear = runnerData.birthYear || existingRunner.birthYear;
            existingRunner.sex = runnerData.sex || existingRunner.sex;
            existingRunner.cardNumber = runnerData.cardNumber || existingRunner.cardNumber;
            existingRunner.nationality = runnerData.nationality || existingRunner.nationality;
            existingRunner.phone = runnerData.phone || existingRunner.phone;
            existingRunner.email = runnerData.email || existingRunner.email;
            existingRunner.timesUsed = Math.max(existingRunner.timesUsed, runnerData.timesUsed || 0);
            existingRunner.lastUsed = new Date(Math.max(
              existingRunner.lastUsed.getTime(),
              new Date(runnerData.lastUsed || runnerData.lastUsed || Date.now()).getTime()
            ));
            updated++;
          } else {
            // Add new runner
            const newRunner: LocalRunner = {
              id: runnerData.id || `runner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: {
                first: runnerData.name.first.trim(),
                last: runnerData.name.last.trim(),
              },
              club: runnerData.club || '',
              birthYear: runnerData.birthYear,
              sex: runnerData.sex,
              cardNumber: runnerData.cardNumber,
              nationality: runnerData.nationality || '',
              phone: runnerData.phone || '',
              email: runnerData.email || '',
              lastUsed: new Date(runnerData.lastUsed || Date.now()),
              timesUsed: runnerData.timesUsed || 0,
            };
            this.runners.push(newRunner);
            imported++;
          }
        } catch (error) {
          errors.push(`Runner ${index + 1}: ${error}`);
        }
      });

      if (imported > 0 || updated > 0) {
        this.saveRunners();
        console.log(`[LocalRunner] Import complete: ${imported} new, ${updated} updated, ${errors.length} errors`);
      }

    } catch (error) {
      errors.push(`Parse error: ${error}`);
    }

    return { imported, updated, errors };
  }

  /**
   * Set cloud sync path
   */
  setCloudPath(path: string): void {
    this.cloudPath = path;
    localStorage.setItem(this.CLOUD_PATH_KEY, path);
    console.log(`[LocalRunner] Cloud path updated to: ${path}`);
  }

  /**
   * Get current cloud path
   */
  getCloudPath(): string {
    return this.cloudPath;
  }

  /**
   * Toggle auto-save to cloud
   */
  setAutoSave(enabled: boolean): void {
    this.autoSaveEnabled = enabled;
    console.log(`[LocalRunner] Auto-save to cloud: ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if auto-save is enabled
   */
  isAutoSaveEnabled(): boolean {
    return this.autoSaveEnabled;
  }

  /**
   * Save runners to cloud file
   */
  async saveToCloud(): Promise<boolean> {
    return this.saveToCloudWithValidation();
  }

  /**
   * Save runners to cloud file with validation to prevent data loss
   */
  private async saveToCloudWithValidation(): Promise<boolean> {
    try {
      // Validate before saving
      const currentCount = this.runners.length;
      console.log(`[LocalRunner] Preparing to save ${currentCount} runners to cloud`);
      
      if (currentCount === 0) {
        console.error('[LocalRunner] Refusing to save empty database to cloud - potential data loss!');
        return false;
      }
      
      // Check if running in Electron
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const exportData = this.exportDatabase();
        const success = await (window as any).electronAPI.saveRunnerDatabase(this.cloudPath, exportData);
        if (success) {
          console.log(`[LocalRunner] Successfully saved ${currentCount} runners to cloud: ${this.cloudPath}`);
          return true;
        } else {
          console.error(`[LocalRunner] Failed to save to cloud: ${this.cloudPath}`);
          return false;
        }
      } else {
        // Fallback for web version - download file
        const exportData = this.exportDatabase();
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `runner_database_${currentCount}_runners.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`[LocalRunner] Downloaded runner database with ${currentCount} runners (web fallback)`);
        return true;
      }
    } catch (error) {
      console.error('[LocalRunner] Error saving to cloud:', error);
      return false;
    }
  }

  /**
   * Load runners from cloud file (SAFE VERSION - uses merge to prevent data loss)
   */
  async loadFromCloud(): Promise<{ success: boolean, imported: number, updated: number, errors: string[] }> {
    try {
      const currentCount = this.runners.length;
      console.log(`[LocalRunner] Current local database has ${currentCount} runners before cloud load`);
      
      // Check if running in Electron
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const jsonData = await (window as any).electronAPI.loadRunnerDatabase(this.cloudPath);
        if (jsonData) {
          // Parse data to check runner count before importing
          let cloudRunnerCount = 0;
          try {
            const data = JSON.parse(jsonData);
            cloudRunnerCount = data.runners ? data.runners.length : 0;
          } catch (e) {
            console.error('[LocalRunner] Failed to parse cloud data:', e);
          }
          
          console.log(`[LocalRunner] Cloud file has ${cloudRunnerCount} runners`);
          
          // WARNING: Only use replace mode if cloud has more data or if local is empty
          const mode = (currentCount === 0 || cloudRunnerCount >= currentCount) ? 'replace' : 'merge';
          console.log(`[LocalRunner] Using ${mode} mode for cloud load`);
          
          if (mode === 'merge' && currentCount > 0) {
            console.warn(`[LocalRunner] Cloud data has fewer runners (${cloudRunnerCount}) than local (${currentCount}). Using merge to prevent data loss.`);
          }
          
          const result = this.importDatabase(jsonData, mode);
          console.log(`[LocalRunner] Successfully loaded from cloud: ${this.cloudPath}`);
          return { success: true, ...result };
        } else {
          console.error(`[LocalRunner] Failed to load from cloud: ${this.cloudPath}`);
          return { success: false, imported: 0, updated: 0, errors: ['Failed to load file'] };
        }
      } else {
        // Web version - use file input
        return new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = (event) => {
                try {
                  const jsonData = event.target?.result as string;
                  // Check cloud runner count for web version too
                  let cloudRunnerCount = 0;
                  try {
                    const data = JSON.parse(jsonData);
                    cloudRunnerCount = data.runners ? data.runners.length : 0;
                  } catch (e) {
                    console.error('[LocalRunner] Failed to parse cloud data:', e);
                  }
                  
                  const mode = (currentCount === 0 || cloudRunnerCount >= currentCount) ? 'replace' : 'merge';
                  console.log(`[LocalRunner] Using ${mode} mode for web file load`);
                  
                  const result = this.importDatabase(jsonData, mode);
                  console.log('[LocalRunner] Successfully loaded from file (web version)');
                  resolve({ success: true, ...result });
                } catch (error) {
                  resolve({ success: false, imported: 0, updated: 0, errors: [String(error)] });
                }
              };
              reader.readAsText(file);
            } else {
              resolve({ success: false, imported: 0, updated: 0, errors: ['No file selected'] });
            }
          };
          input.click();
        });
      }
    } catch (error) {
      console.error('[LocalRunner] Error loading from cloud:', error);
      return { success: false, imported: 0, updated: 0, errors: [String(error)] };
    }
  }

  /**
   * Choose new cloud path using file picker
   */
  async chooseCloudPath(): Promise<string | null> {
    try {
      // Check if running in Electron
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        const newPath = await (window as any).electronAPI.chooseRunnerDatabasePath();
        if (newPath) {
          this.setCloudPath(newPath);
          return newPath;
        }
      } else {
        // Web version fallback - use prompt for now
        const newPath = prompt('Enter cloud sync path (e.g., C:\\Users\\your-user\\OneDrive\\DVOA\\DVOA MeOS Advanced\\runner_database.json):', this.cloudPath);
        if (newPath && newPath.trim()) {
          this.setCloudPath(newPath.trim());
          console.log('[LocalRunner] Cloud path set manually (web version):', newPath);
          return newPath.trim();
        }
      }
    } catch (error) {
      console.error('[LocalRunner] Error choosing cloud path:', error);
    }
    return null;
  }

  /**
   * Get cloud sync status
   */
  getCloudSyncStatus(): { path: string, autoSave: boolean, exists: boolean } {
    return {
      path: this.cloudPath,
      autoSave: this.autoSaveEnabled,
      exists: false // TODO: Check if file exists
    };
  }

  /**
   * Recovery method: restore from localStorage backup if available
   */
  recoverFromLocalStorage(): { success: boolean, recovered: number, message: string } {
    try {
      const currentCount = this.runners.length;
      const stored = localStorage.getItem(this.STORAGE_KEY);
      
      if (!stored) {
        return { 
          success: false, 
          recovered: 0, 
          message: 'No localStorage backup found' 
        };
      }
      
      const backupData = JSON.parse(stored);
      const backupRunners = backupData.map((runner: any) => ({
        ...runner,
        lastUsed: new Date(runner.lastUsed)
      }));
      
      console.log(`[LocalRunner] localStorage backup contains ${backupRunners.length} runners (current: ${currentCount})`);
      
      if (backupRunners.length <= currentCount) {
        return {
          success: false,
          recovered: backupRunners.length,
          message: `localStorage backup has ${backupRunners.length} runners, not more than current ${currentCount}`
        };
      }
      
      // Restore from backup
      this.runners = backupRunners;
      console.log(`[LocalRunner] Successfully restored ${backupRunners.length} runners from localStorage backup`);
      
      // Save the recovered data (this will trigger cloud save if enabled)
      // Temporarily disable auto-save to prevent overwriting cloud with potentially bad data
      const originalAutoSave = this.autoSaveEnabled;
      this.autoSaveEnabled = false;
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.runners));
      this.autoSaveEnabled = originalAutoSave;
      
      return {
        success: true,
        recovered: backupRunners.length,
        message: `Successfully recovered ${backupRunners.length} runners from localStorage backup`
      };
      
    } catch (error) {
      console.error('[LocalRunner] Error during recovery:', error);
      return {
        success: false,
        recovered: 0,
        message: `Recovery failed: ${error}`
      };
    }
  }

  /**
   * Get localStorage backup info without loading it
   */
  getLocalStorageBackupInfo(): { exists: boolean, runnerCount: number, lastSaved?: Date } {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return { exists: false, runnerCount: 0 };
      }
      
      const backupData = JSON.parse(stored);
      const runnerCount = Array.isArray(backupData) ? backupData.length : 0;
      
      // Try to get the most recent lastUsed as an indicator of when backup was saved
      let lastSaved: Date | undefined;
      if (runnerCount > 0) {
        const dates = backupData
          .map((r: any) => new Date(r.lastUsed))
          .sort((a: Date, b: Date) => b.getTime() - a.getTime());
        lastSaved = dates[0];
      }
      
      return {
        exists: true,
        runnerCount,
        lastSaved
      };
    } catch (error) {
      console.error('[LocalRunner] Error checking localStorage backup:', error);
      return { exists: false, runnerCount: 0 };
    }
  }

  /**
   * Try to populate from MeOS API runner lookup (one-time bulk operation)
   */
  async bulkPopulateFromMeOS(commonNames: string[] = []): Promise<{ found: number, errors: string[] }> {
    const errors: string[] = [];
    let found = 0;

    // Use a common list of names if provided, or try some common orienteering names
    const defaultNames = [
      'Anderson', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
      'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
      'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'
    ];
    
    const namesToTry = commonNames.length > 0 ? commonNames : defaultNames;
    
    console.log(`[LocalRunner] Attempting to populate from MeOS with ${namesToTry.length} common names...`);
    
    // Import MeOS API
    const { MeosApiClient } = await import('./meosApi');
    const meosApi = new MeosApiClient();
    
    // Test connection first
    const connected = await meosApi.testConnection();
    if (!connected) {
      errors.push('Cannot connect to MeOS API');
      return { found, errors };
    }
    
    for (const name of namesToTry) {
      try {
        const runners = await meosApi.lookupRunners(name);
        
        for (const runner of runners) {
          if (runner.name && runner.name.trim()) {
            const [firstName, ...lastNameParts] = runner.name.split(' ');
            const lastName = lastNameParts.join(' ');
            
            if (firstName && lastName) {
              const existingRunner = this.runners.find(r => 
                r.name.first.toLowerCase() === firstName.toLowerCase() &&
                r.name.last.toLowerCase() === lastName.toLowerCase()
              );
              
              if (!existingRunner) {
                const newRunner: LocalRunner = {
                  id: `meos_${runner.id || Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  name: { first: firstName, last: lastName },
                  club: runner.club || '',
                  birthYear: runner.birthYear,
                  sex: runner.sex as 'M' | 'F' | undefined,
                  cardNumber: runner.cardNumber,
                  nationality: runner.nationality || '',
                  phone: '',
                  email: '',
                  lastUsed: new Date(),
                  timesUsed: 0, // Don't count bulk population as usage
                };
                this.runners.push(newRunner);
                found++;
              }
            }
          }
        }
        
        // Small delay to be nice to MeOS API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errors.push(`Failed to lookup '${name}': ${error}`);
      }
    }
    
    if (found > 0) {
      this.saveRunners();
      console.log(`[LocalRunner] Bulk MeOS population complete: ${found} runners added`);
    }
    
    return { found, errors };
  }

  /**
   * Get database statistics
   */
  getStats(): { total: number, lastUsed?: Date, totalUsage: number } {
    const totalUsage = this.runners.reduce((sum, r) => sum + r.timesUsed, 0);
    const lastUsed = this.runners.length > 0 
      ? new Date(Math.max(...this.runners.map(r => r.lastUsed.getTime())))
      : undefined;
      
    return {
      total: this.runners.length,
      totalUsage,
      lastUsed
    };
  }

  /**
   * Get current runner count (for debugging)
   */
  getCurrentCount(): number {
    return this.runners.length;
  }
}

export const localRunnerService = new LocalRunnerService();
export default LocalRunnerService;