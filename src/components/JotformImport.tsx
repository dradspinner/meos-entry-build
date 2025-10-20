// Jotform CSV Import Component
import React, { useState, useCallback } from 'react';
import { 
  Card, 
  Upload, 
  Button, 
  Table, 
  Alert, 
  Space, 
  Typography, 
  Progress,
  Divider,
  Tag,
  App,
  Modal
} from 'antd';
import { 
  InboxOutlined, 
  FileTextOutlined, 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UploadOutlined 
} from '@ant-design/icons';
import Papa from 'papaparse';
import type { Entry, EntryParams } from '../types/index.js';
import { meosApi } from '../services/meosApi';
import { localEntryService } from '../services/localEntryService';
import { localRunnerService } from '../services/localRunnerService';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface JotformEntry {
  // These will be mapped from the actual Jotform/MeOS CSV columns
  stno: string;           // Start number
  chip: string;           // SI Card number
  databaseId: string;     // Database ID
  surname: string;        // Last name
  firstName: string;      // First name  
  yb: string;            // Year of birth
  s: string;             // Sex (M/F)
  clubNo: string;        // Club number
  clName: string;        // Club name
  city: string;          // City
  nat: string;           // Nationality
  clNo: string;          // Class number
  short: string;         // Short course name
  long: string;          // Long course name
  phone: string;         // Phone number
  email: string;         // Email
  rented: string;        // Rented card (0/1)
  startFee: string;      // Start fee
  paid: string;          // Paid (0/1)
  [key: string]: string; // For any additional fields
}

interface ImportStatus {
  total: number;
  processed: number;
  successful: number;
  errors: number;
  isImporting: boolean;
}

interface ImportResult {
  entry: JotformEntry;
  status: 'pending' | 'success' | 'error';
  error?: string;
  meosResponse?: any;
}

const JotformImport: React.FC = () => {
  const { message } = App.useApp();
  const [csvData, setCsvData] = useState<JotformEntry[]>([]);
  const [rawCsvData, setRawCsvData] = useState<any[]>([]); // Store original parsed CSV data
  const [csvFormat, setCsvFormat] = useState<'OE12' | 'Jotform' | null>(null); // Store detected format
  const [importResults, setImportResults] = useState<ImportResult[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    total: 0,
    processed: 0,
    successful: 0,
    errors: 0,
    isImporting: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalNames, setOriginalNames] = useState<Map<string, {firstName: string, surname: string}>>(new Map());
  const [fixedEntries, setFixedEntries] = useState<Set<string>>(new Set());
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [lastImportStats, setLastImportStats] = useState<{newCount: number, updatedCount: number} | null>(null);
  const [meosConnected, setMeosConnected] = useState<boolean | null>(null);
  const [checkingMeos, setCheckingMeos] = useState(false);
  
  // Pagination state for CSV preview table
  const [csvPagination, setCsvPagination] = useState({
    current: 1,
    pageSize: 100,
    showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} of ${total} entries`,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['50', '100', '200', '500'],
  });
  
  // Pagination state for results table
  const [resultsPagination, setResultsPagination] = useState({
    current: 1,
    pageSize: 100,
    showTotal: (total: number, range: [number, number]) => `${range[0]}-${range[1]} of ${total} results`,
    showSizeChanger: true,
    showQuickJumper: true,
    pageSizeOptions: ['50', '100', '200', '500'],
  });
  
  // Handle CSV table pagination changes
  const handleCsvTableChange = (paginationConfig: any) => {
    setCsvPagination({
      ...csvPagination,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
    });
  };
  
  // Handle results table pagination changes  
  const handleResultsTableChange = (paginationConfig: any) => {
    setResultsPagination({
      ...resultsPagination,
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
    });
  };

  // Handle file upload and CSV parsing
  const handleFileUpload = useCallback((file: File) => {
    setSelectedFile(file);

    // Try to automatically set working directory from the chosen file (best-effort)
    (async () => {
      try {
        const currentWorkingDir = localEntryService.getWorkingDirectoryName() || localEntryService.getWorkingDirectoryPath();
        if (!currentWorkingDir) {
          const ok = await (localEntryService as any).setWorkingDirectoryFromSelectedFile?.(file);
          if (ok) {
            const dirName = localEntryService.getWorkingDirectoryName();
            if (dirName) setWorkingDirectory(dirName);
          }
        }
      } catch {}
    })();
    
    // Auto-detect delimiter based on file content
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const firstLine = content.split('\n')[0] || '';
      
      // Detect delimiter: OE12 uses comma, Jotform uses semicolon
      const delimiter = firstLine.includes('OE0002_V12') || firstLine.split(',').length > firstLine.split(';').length ? ',' : ';';
      
      console.log(`[CSV Parse] Auto-detected delimiter: "${delimiter}"`);
      
      Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        delimiter: delimiter,
        skipLinesWithError: false, // Keep lines with field mismatch
        transformHeader: (header) => header.trim(), // Clean headers
        complete: (results: any) => {
        console.log('Parsed CSV:', results);
        
        if (results.errors.length > 0) {
          console.error('CSV parsing errors:', results.errors);
          
          // Log first few errors for debugging
          results.errors.slice(0, 5).forEach((error, index) => {
            console.error(`CSV Error ${index + 1}:`, {
              type: error.type,
              code: error.code,
              message: error.message,
              row: error.row
            });
          });
          
          // Only show error if there are critical parsing errors
          const criticalErrors = results.errors.filter(error => 
            error.type === 'Delimiter' || error.type === 'Quotes' || error.code === 'UndetectableDelimiter'
          );
          
          if (criticalErrors.length > 0) {
            message.error(`CSV parsing failed: ${criticalErrors[0].message}`);
            return;
          } else {
            console.warn(`${results.errors.length} non-critical CSV parsing warnings (continuing with import)`);
          }
        }

        try {
          console.log(`[CSV Debug] First parsed row:`, results.data[0]);
          console.log(`[CSV Debug] Headers:`, results.meta.fields);
          
          // Detect format based on headers to use correct parsing function
          const isOE12 = results.meta.fields?.includes('OE0002_V12') || results.meta.fields?.includes('Entry Id');
          const detectedFormat = isOE12 ? 'OE12' : 'Jotform';
          console.log(`[CSV Debug] Format detected:`, detectedFormat);
          
          // Store raw CSV data and format
          setRawCsvData(results.data);
          setCsvFormat(detectedFormat);
          
          const entries = results.data.map((row: any, index: number) => 
            isOE12 ? parseOE12Row(row, index) : parseJotformRow(row, index)
          );
          
          const validEntries = entries.filter(entry => entry !== null);
          console.log(`[CSV Debug] First valid entry:`, validEntries[0]);
          
          setCsvData(validEntries);
          setImportResults([]);
          setOriginalNames(new Map());
          setFixedEntries(new Set());
          setLastImportStats(null); // Clear previous import stats
          message.success(`Loaded ${validEntries.length} entries from CSV`);
          
          // Prompt to set working directory if not already set
          const currentWorkingDir = localEntryService.getWorkingDirectoryName() || localEntryService.getWorkingDirectoryPath();
          if (!currentWorkingDir) {
            setTimeout(() => {
              message.info({
                content: 'Set your working directory to save backup files in the same location as your CSV file.',
                duration: 8,
                key: 'working-dir-prompt'
              });
            }, 1000);
          }

          // Auto-save for OE12 immediately (attempt will set directory automatically in Electron)
          if (detectedFormat === 'OE12') {
            if (meosConnected) {
              // Use raw data for OE12 import to preserve headers
              handleSaveLocally({ detectedFormat: 'OE12', data: results.data, fileNameOverride: file.name });
            } else {
              Modal.confirm({
                title: 'MeOS API not connected',
                content: (
                  <div>
                    <p>The MeOS API is not reachable. Class mapping will fall back to built-in mappings.</p>
                    <p>Please start MeOS REST API for best results, or continue with fallback mapping.</p>
                  </div>
                ),
                okText: 'Proceed (fallback mapping)',
                cancelText: 'Cancel',
                onOk: () => handleSaveLocally({ detectedFormat: 'OE12', data: results.data, fileNameOverride: file.name }),
              });
            }
          }
        } catch (error) {
          message.error('Failed to parse CSV data. Please check the format.');
          console.error('Parse error:', error);
        }
      },
        error: (error: any) => {
          message.error('Failed to read CSV file');
          console.error('File read error:', error);
        }
      });
    };
    
    reader.onerror = () => {
      message.error('Failed to read file');
    };
    
    reader.readAsText(file);
    
    return false; // Prevent default upload behavior
  }, [meosConnected]); // Include meosConnected in dependency array

  // Set working directory for consistent file saving
  const handleSetWorkingDirectory = async () => {
    try {
      const success = await localEntryService.setWorkingDirectory();
      if (success) {
        const dirName = localEntryService.getWorkingDirectoryName();
        setWorkingDirectory(dirName);
        message.success(`Working directory set to: ${dirName}`);
      }
    } catch (error) {
      console.error('Failed to set working directory:', error);
      message.error('Failed to set working directory');
    }
  };

  // Check for existing working directory on component mount
  React.useEffect(() => {
    const dirName = localEntryService.getWorkingDirectoryName();
    if (dirName) {
      setWorkingDirectory(dirName);
    }
  }, []);

  // Check MeOS connectivity on mount
  const checkMeos = async () => {
    try {
      setCheckingMeos(true);
      const ok = await meosApi.testConnection();
      setMeosConnected(ok);
    } catch {
      setMeosConnected(false);
    } finally {
      setCheckingMeos(false);
    }
  };

  React.useEffect(() => { checkMeos(); }, []);

  // Helper function to check if a name is properly capitalized
  const isProperlyCapitalized = (name: string): boolean => {
    if (!name || name.trim() === '') return true;
    
    // Split by spaces and hyphens to handle compound names
    const parts = name.split(/[\s-]+/);
    
    return parts.every(part => {
      if (part.length === 0) return true;
      // First letter should be uppercase, rest can be mixed but we'll be lenient
      return part[0] === part[0].toUpperCase();
    });
  };

  // Helper function to properly capitalize a name
  const capitalizeName = (name: string): string => {
    if (!name || name.trim() === '') return name;
    
    // Split by spaces and hyphens to handle compound names
    const parts = name.split(/([\s-]+)/);
    
    return parts.map((part, index) => {
      // Keep separators (spaces, hyphens) as-is
      if (index % 2 === 1) return part;
      
      // Capitalize each word part
      if (part.length === 0) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join('');
  };

  // Helper function to check if entry has capitalization issues
  const hasCapitalizationIssues = (entry: JotformEntry): boolean => {
    // Always check capitalization for OE12/Jotform entries; group detection varies by format
    return !isProperlyCapitalized(entry.firstName) || !isProperlyCapitalized(entry.surname);
  };

  // Fix capitalization for a specific entry
  const fixCapitalization = (entryStno: string) => {
    setCsvData(prevData => {
      return prevData.map(entry => {
        if (entry.stno === entryStno) {
          // Store original names before fixing
          const originalKey = entryStno;
          if (!originalNames.has(originalKey)) {
            setOriginalNames(prev => new Map(prev).set(originalKey, {
              firstName: entry.firstName,
              surname: entry.surname
            }));
          }
          
          // Fix the names
          const fixedEntry = {
            ...entry,
            firstName: capitalizeName(entry.firstName),
            surname: capitalizeName(entry.surname)
          };
          
          // Mark as fixed
          setFixedEntries(prev => new Set(prev).add(entryStno));
          
          return fixedEntry;
        }
        return entry;
      });
    });
  };

  // Undo capitalization fix for a specific entry
  const undoCapitalizationFix = (entryStno: string) => {
    const original = originalNames.get(entryStno);
    if (!original) return;
    
    setCsvData(prevData => {
      return prevData.map(entry => {
        if (entry.stno === entryStno) {
          return {
            ...entry,
            firstName: original.firstName,
            surname: original.surname
          };
        }
        return entry;
      });
    });
    
    // Remove from fixed entries
    setFixedEntries(prev => {
      const newSet = new Set(prev);
      newSet.delete(entryStno);
      return newSet;
    });
  };

  // Auto-fix all capitalization issues
  const fixAllCapitalization = () => {
    const entriesToFix = csvData.filter(entry => hasCapitalizationIssues(entry));
    entriesToFix.forEach(entry => {
      if (!fixedEntries.has(entry.stno)) {
        fixCapitalization(entry.stno);
      }
    });
  };

  // Export processed data as CSV for manual MeOS import
  const exportForMeosImport = () => {
    if (csvData.length === 0) {
      message.warning('No data to export');
      return;
    }

    // Create CSV content with semicolon delimiter (same format as original)
    const headers = 'Stno;Chip;Database Id;Surname;First name;YB;S;Block;nc;Start;Finish;Time;Classifier;Club no.;Cl.name;City;Nat;Cl. no.;Short;Long;Num1;Num2;Num3;Text1;Text2;Text3;Addr. surname;Addr. first name;Street;Line2;Zip;Addr. city;Phone;Fax;EMail;Rented;Start fee;Paid';
    
    const csvRows = csvData.map(entry => [
      entry.stno,
      entry.chip,
      entry.databaseId,
      entry.surname,
      entry.firstName,
      entry.yb,
      entry.s,
      '', // Block
      '0', // nc
      '', // Start
      '', // Finish
      '', // Time
      '0', // Classifier
      entry.clubNo,
      entry.clName,
      entry.city,
      entry.nat,
      entry.clNo,
      entry.short,
      entry.long,
      '', '', '', // Num1, Num2, Num3
      '', '', '', // Text1, Text2, Text3
      '', '', '', '', '', '', // Address fields
      entry.phone,
      '', // Fax
      entry.email,
      entry.rented,
      entry.startFee,
      entry.paid
    ].join(';'));

    const csvContent = [headers, ...csvRows].join('\r\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meos_import_${new Date().toISOString().slice(0, 10).replace(/-/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    message.success(`CSV exported for MeOS manual import`);
  };

  // Parse individual OE12 CSV row (EventReg format)
  const parseOE12Row = (row: any, index: number): JotformEntry | null => {
    try {
      // Debug: Log all available fields for the first few entries
      if (index < 3) {
        console.log(`[OE12 Debug] Entry ${index} - All fields:`, Object.keys(row));
        console.log(`[OE12 Debug] Entry ${index} - Sample values:`, {
          'First name': row['First name'],
          'Surname': row['Surname'], 
          'Family name': row['Family name'],
          'Last name': row['Last name'],
          'YB': row['YB'],
          'Birth year': row['Birth year'],
          'Year': row['Year'],
          'S': row['S'],
          'Sex': row['Sex'],
          'Gender': row['Gender'],
          'City': row['City'],
          'Club': row['Club'],
          'Cl.name': row['Cl.name'],
          'Short': row['Short'],
          'Cl. no.': row['Cl. no.'],
          'Chipno1': row['Chipno1'],
          'Chipno2': row['Chipno2'],
          'Chip': row['Chip']
        });
      }
      
      // Map OE12 fields to our internal format
      const chipValue = row['Chipno1'] || row['Chipno2'] || row['Chipno3'] || row['Chipno4'] || row['Chipno5'] || row['Chipno6'] || '';
      const clubValue = row['Cl.name'] || row['City'] || 'DVOA'; // Prefer club name, fallback to City for OE12
      
      const entry: JotformEntry = {
        stno: row['Stno'] || '',
        chip: chipValue, // Use Chipno1-6 fields for SI card number
        databaseId: row['Database Id'] || '',
        surname: row['Surname'] || row['Family name'] || row['Last name'] || '',
        firstName: row['First name'] || '',
        yb: row['YB'] || row['Birth year'] || row['Year'] || '',
        s: row['S'] || row['Sex'] || row['Gender'] || '',
        clubNo: row['Club no.'] || '',
        clName: clubValue, // Club name with DVOA default
        city: row['City'] || '',
        nat: row['Nat'] || '',
        clNo: row['Cl. no.'] || '',
        short: row['Short'] || '',
        long: row['Long'] || '',
        phone: row['Phone'] || row['Mobile'] || '',
        email: row['EMail'] || '',
        rented: (row['Rented'] === 'X' || row['Rented'] === '1') ? '1' : '0',
        startFee: row['Start fee'] || '0',
        paid: row['Paid'] || '0',
      };

      // Add all other fields as dynamic properties
      Object.keys(row).forEach(key => {
        if (!entry.hasOwnProperty(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          entry[key] = row[key];
        }
      });

      return entry;
    } catch (error) {
      console.error(`Error parsing OE12 row ${index}:`, error, row);
      return null;
    }
  };

  // Parse individual Jotform CSV row
  const parseJotformRow = (row: any, index: number): JotformEntry | null => {
    try {
      // Map the exact column names from your Jotform/MeOS CSV
      const entry: JotformEntry = {
        stno: row['Stno'] || '',
        chip: row['Chip'] || '',
        databaseId: row['Database Id'] || '',
        surname: row['Surname'] || '',
        firstName: row['First name'] || '',
        yb: row['YB'] || '',
        s: row['S'] || '',
        clubNo: row['Club no.'] || '',
        clName: row['Cl.name'] || '',
        city: row['City'] || '',
        nat: row['Nat'] || '',
        clNo: row['Cl. no.'] || '',
        short: row['Short'] || '',
        long: row['Long'] || '',
        phone: row['Phone'] || '',
        email: row['EMail'] || '',
        rented: row['Rented'] || '0',
        startFee: row['Start fee'] || '0',
        paid: row['Paid'] || '0',
      };

      // Add all other fields as dynamic properties
      Object.keys(row).forEach(key => {
        if (!entry.hasOwnProperty(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          entry[key] = row[key];
        }
      });

      return entry;
    } catch (error) {
      console.error(`Error parsing row ${index}:`, error, row);
      return null;
    }
  };

  // Convert Jotform entry to MeOS entry format
  const convertToMeosEntry = (jotformEntry: JotformEntry): EntryParams => {
    // Map course names to MeOS class IDs based on the API response:
    // Blue=1, Brown=2, Green=3, Orange=4, Red=5, White=6, Yellow=7
    const courseToClassId: Record<string, number> = {
      'Blue': 1,
      'Brown': 2, 
      'Green': 3,
      'Orange': 4,
      'Red': 5,
      'White': 6,
      'Yellow': 7,
    };
    
    const courseName = jotformEntry.short || jotformEntry.long;
    const classId = courseToClassId[courseName] || parseInt(jotformEntry.clNo) || 1;
    
    const cardNumber = parseInt(jotformEntry.chip) || 0;
    
    return {
      name: `${jotformEntry.firstName} ${jotformEntry.surname}`.trim(),
      club: jotformEntry.clName || 'DVOA', // Default to DVOA club
      classId: classId,
      cardNumber: cardNumber, // Let MeOS handle card 0 for rentals and groups
      phone: jotformEntry.phone,
      birthYear: parseInt(jotformEntry.yb) || undefined,
      sex: (jotformEntry.s === 'M' || jotformEntry.s === 'F') ? jotformEntry.s as 'M' | 'F' : undefined,
      nationality: jotformEntry.nat || undefined,
      // Additional MeOS-specific fields that might be useful
      bib: jotformEntry.stno || undefined,
    };
  };

  // Save all entries locally for check-in workflow
  const handleSaveLocally = async (opts?: { detectedFormat?: 'OE12' | 'Jotform'; data?: any[]; fileNameOverride?: string }) => {
    const detectedFormat = opts?.detectedFormat || csvFormat;
    const dataSource = opts?.data || (detectedFormat === 'OE12' ? rawCsvData : csvData);

    if (!dataSource || dataSource.length === 0) {
      message.warning('No entries to save');
      return;
    }

    setImportStatus({
      total: dataSource.length,
      processed: 0,
      successful: 0,
      errors: 0,
      isImporting: true,
    });

    const results: ImportResult[] = [];

    try {
      // Ensure working directory is set (best-effort) before saving backup
      try {
        const currentWorkingDir = localEntryService.getWorkingDirectoryName() || localEntryService.getWorkingDirectoryPath();
        if (!currentWorkingDir && selectedFile) {
          const ok = await (localEntryService as any).setWorkingDirectoryFromSelectedFile?.(selectedFile as File);
          if (ok) {
            const dirName = localEntryService.getWorkingDirectoryName();
            if (dirName) setWorkingDirectory(dirName);
          }
        }
      } catch {}

      // Import all entries to local storage, passing filename to set directory preference
      const fileName = opts?.fileNameOverride || selectedFile?.name;
      
      console.log(`[Import] Using ${detectedFormat} format, importing ${dataSource.length} entries`);
      
      const importResult = await localEntryService.importFromCsv(
        dataSource,
        fileName,
        (processed: number, total: number) => {
          setImportStatus(prev => ({ ...prev, processed }));
        }
      );
      
      // Learn runners from imported entries for future auto-completion
      const runnerLearningResult = localRunnerService.bulkLearnFromEntries(importResult.entries);
      console.log(`[CSV Import] Learned ${runnerLearningResult.imported} new runners and updated ${runnerLearningResult.updated} existing runners`);
      
      // Create success results for all entries (normalize to JotformEntry shape for display)
      for (let i = 0; i < dataSource.length; i++) {
        const raw = dataSource[i] as any;
        let displayEntry: JotformEntry | null = null;

        if (detectedFormat === 'OE12') {
          // Parse OE12 row into JotformEntry-like shape for consistent rendering
          displayEntry = parseOE12Row(raw, i);
          if (!displayEntry) {
            displayEntry = {
              stno: raw['Stno'] || '',
              chip: raw['Chipno1'] || raw['Chipno2'] || '',
              databaseId: raw['Database Id'] || '',
              surname: raw['Surname'] || raw['Family name'] || raw['Last name'] || '',
              firstName: raw['First name'] || '',
              yb: raw['YB'] || raw['Birth year'] || raw['Year'] || '',
              s: raw['S'] || raw['Sex'] || raw['Gender'] || '',
              clubNo: raw['Club no.'] || '',
              clName: raw['Cl.name'] || raw['City'] || '',
              city: raw['City'] || '',
              nat: raw['Nat'] || '',
              clNo: raw['Cl. no.'] || '',
              short: raw['Short'] || '',
              long: raw['Long'] || '',
              phone: raw['Phone'] || raw['Mobile'] || '',
              email: raw['EMail'] || '',
              rented: (raw['Rented'] === 'X' || raw['Rented'] === '1') ? '1' : '0',
              startFee: raw['Start fee'] || '0',
              paid: raw['Paid'] || '0',
            } as JotformEntry;
          }
        } else {
          displayEntry = raw as JotformEntry;
        }

        const result: ImportResult = {
          entry: displayEntry!,
          status: 'success',
        };
        
        results.push(result);
        setImportStatus(prev => ({ 
          ...prev, 
          processed: prev.processed + 1,
          successful: prev.successful + 1
        }));
      }
      
      setImportResults(results);
      setLastImportStats({ newCount: importResult.newCount, updatedCount: importResult.updatedCount });
      
      // Automatically create a backup JSON file for safety
      try {
        await localEntryService.exportToFile();
        const workingDir = localEntryService.getWorkingDirectoryName();
        const workingPath = localEntryService.getWorkingDirectoryPath();
        
        let locationMsg = '';
        const isElectron = typeof (window as any).process !== 'undefined' && !!(window as any).process.versions?.electron;
        if (isElectron && workingPath) {
          locationMsg = ` to ${workingPath}`;
        } else if (workingDir && workingPath) {
          // Browser fallback case where we can't auto-save into the folder
          locationMsg = `. Please move the downloaded file to: ${workingPath}`;
        } else if (workingDir) {
          locationMsg = ` in ${workingDir}`;
        }
        
        const { newCount, updatedCount, format } = importResult;
        let statusMsg = '';
        if (newCount > 0 && updatedCount > 0) {
          statusMsg = `Added ${newCount} new entries and updated ${updatedCount} existing entries`;
        } else if (newCount > 0) {
          statusMsg = `Added ${newCount} new entries`;
        } else if (updatedCount > 0) {
          statusMsg = `Updated ${updatedCount} existing entries`;
        } else {
          statusMsg = 'No changes made';
        }
        
        message.success(`${statusMsg} from ${format} format locally AND created backup file${locationMsg}. They will be ready for check-in on event day.`, 10);

        // Show detailed completion dialog
        try {
          const capitalizationIssues = csvData.filter(entry => hasCapitalizationIssues(entry)).length;
          Modal.success({
            title: 'Import Complete',
            width: 640,
            okText: 'OK',
            content: (
              <div>
                <p><strong>Entries imported:</strong> {dataSource.length}</p>
                <p><strong>New:</strong> {newCount} • <strong>Updated:</strong> {updatedCount}</p>
                <p><strong>Capitalization checks:</strong> {capitalizationIssues === 0 ? 'All good' : `${capitalizationIssues} need review (use Fix All)`}</p>
                <p><strong>Backup saved</strong>{locationMsg || ''}.</p>
                <p style={{ marginTop: 8 }}>
                  Next: click <strong>Continue to Review & Fix</strong> to align with the Runner Database.
                </p>
              </div>
            ),
          });
        } catch {}
      } catch (exportError) {
        console.warn('Local save succeeded but backup file creation failed:', exportError);
        const { newCount, updatedCount, format } = importResult;
        let statusMsg = '';
        if (newCount > 0 && updatedCount > 0) {
          statusMsg = `Added ${newCount} new entries and updated ${updatedCount} existing entries`;
        } else if (newCount > 0) {
          statusMsg = `Added ${newCount} new entries`;
        } else if (updatedCount > 0) {
          statusMsg = `Updated ${updatedCount} existing entries`;
        } else {
          statusMsg = 'No changes made';
        }
        
        message.success(`${statusMsg} from ${format} format locally. They will be ready for check-in on event day. (Note: Automatic backup file creation failed - you can create one manually with Export button)`);
      }
      
    } catch (error: any) {
      console.error('Failed to save entries locally:', error);
      message.error('Failed to save entries to local storage');
      
      // Mark all as errors
      for (const entry of csvData) {
        results.push({
          entry,
          status: 'error',
          error: error.message || 'Failed to save locally'
        });
      }
      setImportResults(results);
    }

    setImportStatus(prev => ({ ...prev, isImporting: false }));
  };

  // Table columns for CSV preview
  const csvColumns = [
    {
      title: 'St#',
      dataIndex: 'stno',
      key: 'stno',
      width: 60,
    },
    {
      title: 'Name & Contact',
      key: 'name',
      render: (record: JotformEntry) => {
        const fullName = `${record.firstName} ${record.surname}`;
        const hasIssue = hasCapitalizationIssues(record);
        const isFixed = fixedEntries.has(record.stno);
        const nat = parseInt(record.nat) || 0;
        
        // Build contact info line (email and phone only)
        const contactParts = [];
        if (record.email) contactParts.push(record.email);
        if (record.phone) contactParts.push(record.phone);
        const contactInfo = contactParts.join(' • ');
        
        let nameElement;
        if (isFixed) {
          nameElement = (
            <span>
              <span style={{ color: '#52c41a' }}>✓ </span>
              <span style={{ color: '#52c41a' }}>{fullName}</span>
              <span style={{ fontSize: '11px', color: '#999', marginLeft: '4px' }}>(fixed)</span>
            </span>
          );
        } else if (hasIssue) {
          nameElement = (
            <span>
              <span style={{ color: '#ff4d4f' }}>⚠️ </span>
              <span style={{ color: '#ff7a00' }}>{fullName}</span>
            </span>
          );
        } else if (nat >= 2) {
          // Show group indicator for groups (Nat >= 2)
          nameElement = (
            <span>
              <span style={{ color: '#1890ff' }}>👥 </span>
              {fullName}
            </span>
          );
        } else {
          nameElement = <span>{fullName}</span>;
        }
        
        return (
          <Space direction="vertical" size={2}>
            {nameElement}
            {contactInfo && (
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {contactInfo}
              </Text>
            )}
          </Space>
        );
      },
      width: 220, // Increased width for contact info
    },
    {
      title: 'YB',
      dataIndex: 'yb',
      key: 'yb',
      width: 60,
    },
    {
      title: 'S',
      dataIndex: 's',
      key: 's',
      width: 40,
    },
    {
      title: 'Nat',
      key: 'nat',
      render: (record: JotformEntry) => {
        // Display nationality or code as-is; do not infer group size from this field
        return <span>{record.nat}</span>;
      },
      width: 60,
    },
    {
      title: 'Club',
      dataIndex: 'clName',
      key: 'clName',
      width: 100,
    },
    {
      title: 'Course',
      key: 'course',
      render: (record: JotformEntry) => {
        const courseName = record.short || record.long;
        return <span>{courseName}</span>;
      },
      width: 80,
    },
    {
      title: 'SI Card',
      dataIndex: 'chip',
      key: 'chip',
      width: 80,
    },
    {
      title: 'Card Status',
      key: 'cardStatus',
      render: (record: JotformEntry) => {
        const rentedValue = parseFloat(record.rented) || 0;
        const cardNumber = parseInt(record.chip) || 0;
        
        if (rentedValue > 0) {
          return <span style={{ color: '#faad14' }}>🏷️ Rented</span>;
        } else if (cardNumber > 0) {
          return <span style={{ color: '#52c41a' }}>✓ Own ({cardNumber})</span>;
        } else {
          return <span style={{ color: '#666' }}>🎟️ No card (assign at check-in)</span>;
        }
      },
      width: 120,
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: JotformEntry) => {
        const hasIssue = hasCapitalizationIssues(record);
        const isFixed = fixedEntries.has(record.stno);
        const nat = parseInt(record.nat) || 0;
        
        // Don't show buttons for groups
        if (nat >= 2) return null;
        
        if (isFixed) {
          return (
            <Button
              size="small"
              onClick={() => undoCapitalizationFix(record.stno)}
              icon={<span>↶</span>}
              title="Undo capitalization fix"
            >
              Undo
            </Button>
          );
        } else if (hasIssue) {
          return (
            <Button
              size="small"
              type="primary"
              onClick={() => fixCapitalization(record.stno)}
              icon={<span>✓</span>}
              title="Fix capitalization"
            >
              Fix
            </Button>
          );
        }
        
        return null;
      },
      width: 80,
    },
  ];

  // Table columns for import results
  const resultsColumns = [
    {
      title: 'Name',
      key: 'name',
      render: (record: ImportResult) => `${record.entry.firstName} ${record.entry.surname}`,
    },
    {
      title: 'Status',
      key: 'status',
      render: (record: ImportResult) => {
        const statusConfig = {
          pending: { color: 'processing', icon: <ExclamationCircleOutlined /> },
          success: { color: 'success', icon: <CheckCircleOutlined /> },
          error: { color: 'error', icon: <ExclamationCircleOutlined /> },
        };
        const config = statusConfig[record.status];
        return <Tag color={config.color} icon={config.icon}>{record.status.toUpperCase()}</Tag>;
      },
    },
    {
      title: 'Details',
      key: 'details',
      render: (record: ImportResult) => {
        if (record.status === 'error') {
          return <Text type="danger">{record.error}</Text>;
        } else if (record.status === 'success') {
          return <Text type="success">Successfully imported</Text>;
        }
        return <Text type="secondary">Pending...</Text>;
      },
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <FileTextOutlined /> Registration CSV Import
      </Title>
      <Text type="secondary">
        Import registration data from Jotform MeOS exports or EventReg (OE12 format) CSV files into MeOS
      </Text>

      <Alert
        message="📋 Supported CSV Formats"
        description={
          <div>
            <p><strong>This tool automatically detects and supports:</strong></p>
            <ul style={{ marginBottom: 0, paddingLeft: '16px' }}>
              <li><strong>EventReg OE12 Format:</strong> CSV exports from EventReg using OE12 standard format</li>
              <li><strong>Jotform MeOS Format:</strong> CSV exports from Jotform with MeOS field mapping</li>
            </ul>
            <p style={{ marginTop: '8px', marginBottom: 0 }}>
              <Text type="secondary">The format is detected automatically - just upload your CSV file!</Text>
            </p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginTop: '16px', marginBottom: '24px' }}
      />

      <Divider />

      {/* File Upload Section */}
      <Card title="1. Upload CSV File" style={{ marginBottom: '24px' }}>
        <Dragger
          accept=".csv"
          beforeUpload={handleFileUpload}
          showUploadList={false}
          disabled={importStatus.isImporting}
          onDrop={async (e) => {
            try {
              const dt = e.dataTransfer;
              if (!dt) return;
              const item = dt.items && dt.items.length > 0 ? dt.items[0] : null;
              if (!item) return;
              // Try modern handle first
              if ('getAsFileSystemHandle' in item) {
                // @ts-ignore - experimental API
                const handle = await (item as any).getAsFileSystemHandle();
                if (handle && handle.kind === 'file') {
                  // Try to set working directory from the dropped file's location
                  await localEntryService.setWorkingDirectoryFromFileHandle(handle);
                  const dirName = localEntryService.getWorkingDirectoryName();
                  if (dirName) setWorkingDirectory(dirName);
                }
              } else if ('webkitGetAsEntry' in item) {
                // @ts-ignore - legacy API in Chromium
                const entry = (item as any).webkitGetAsEntry && (item as any).webkitGetAsEntry();
                if (entry && entry.isFile && entry.getParent) {
                  entry.getParent(async (parent: any) => {
                    if (parent) {
                      // We can't convert legacy entry to a handle; just set a name hint
                      try {
                        await localEntryService.setSaveDirectoryPreference(parent.name || 'MeOS Event Entries');
                        setWorkingDirectory(parent.name || null);
                      } catch {}
                    }
                  });
                }
              }
            } catch (err) {
              console.warn('Failed to infer directory from dropped file:', err);
            }
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            Click or drag CSV file to upload
          </p>
          <p className="ant-upload-hint">
            Supports CSV files from Jotform and EventReg (OE12 format)
          </p>
        </Dragger>
        
        {/* Optional: Use native file picker to auto-set directory (Chrome/Edge) */}
        {'showOpenFilePicker' in window && (
          <div style={{ marginTop: 12 }}>
            <Space>
              <Button 
                onClick={async () => {
                  try {
                    // @ts-ignore - File System Access API
                    const [fileHandle] = await (window as any).showOpenFilePicker({
                      multiple: false,
                      types: [{
                        description: 'CSV files',
                        accept: { 'text/csv': ['.csv'] }
                      }]
                    });
                    if (fileHandle) {
                      const file = await fileHandle.getFile();
                      await localEntryService.setWorkingDirectoryFromFileHandle(fileHandle);
                      const dirName = localEntryService.getWorkingDirectoryName();
                      if (dirName) setWorkingDirectory(dirName);
                      // Reuse existing upload flow to parse
                      handleFileUpload(file);
                    }
                  } catch (err) {
                    // User cancelled or API not available
                  }
                }}
              >
                Open CSV (native picker)
              </Button>
              {workingDirectory && (
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Directory: <Text code>{workingDirectory}</Text>
                </Text>
              )}
            </Space>
          </div>
        )}
        
        {selectedFile && (
          <div>
            <Alert
              message={`File loaded: ${selectedFile.name}`}
              description={`${csvData.length} entries found`}
              type="success"
              showIcon
              style={{ marginTop: '16px' }}
            />
            {(() => {
              const capitalizationIssues = csvData.filter(entry => hasCapitalizationIssues(entry));
              const groupCount = csvData.filter(entry => parseInt(entry.nat || '0') >= 2).length;
              const fixedCount = fixedEntries.size;
              const noCardCount = csvData.filter(entry => parseInt(entry.chip) === 0 && parseFloat(entry.rented) === 0).length;
              
              if (capitalizationIssues.length > 0) {
                return (
                  <Alert
                    message="Name Capitalization Issues Found"
                    description={`${capitalizationIssues.length} entries have capitalization issues (${groupCount} groups ignored). ${fixedCount > 0 ? `${fixedCount} already fixed.` : ''}`}
                    type="warning"
                    showIcon
                    style={{ marginTop: '8px' }}
                    action={
                      <Button 
                        size="small" 
                        type="primary" 
                        onClick={fixAllCapitalization}
                        disabled={capitalizationIssues.length === 0}
                      >
                        Fix All
                      </Button>
                    }
                  />
                );
              } else if (fixedCount > 0) {
                return (
                  <Alert
                    message="Name Capitalization Issues Fixed"
                    description={`All capitalization issues have been fixed (${fixedCount} entries, ${groupCount} groups ignored).`}
                    type="success"
                    showIcon
                    style={{ marginTop: '8px' }}
                  />
                );
              } else {
                return (
                  <Alert
                    message="Name Capitalization Check Passed"
                    description={`All individual names are properly capitalized (${groupCount} groups not checked).`}
                    type="info"
                    showIcon
                    style={{ marginTop: '8px' }}
                  />
                );
              }
            })()
            }
            {(() => {
              const noCardCount = csvData.filter(entry => parseInt(entry.chip) === 0 && parseFloat(entry.rented) === 0).length;
              
              if (noCardCount > 0) {
                return (
                  <Alert
                    message="No Card Numbers"
                    description={`${noCardCount} entries have no card numbers. These will be stored locally and cards can be assigned during check-in.`}
                    type="info"
                    showIcon
                    style={{ marginTop: '8px' }}
                  />
                );
              }
              return null;
            })()
            }
          </div>
        )}
      </Card>

      {/* Import Results Alert */}
      {lastImportStats && importResults.length > 0 && importResults.every(r => r.status === 'success') && (() => {
        const { newCount, updatedCount } = lastImportStats;
        
        let alertType: 'success' | 'info' = 'success';
        let alertMessage = 'Import Completed Successfully';
        let alertDescription = '';
        
        if (updatedCount > 0 && newCount > 0) {
          alertType = 'info';
          alertMessage = '✅ Smart Import: Duplicates Detected & Updated';
          alertDescription = `Added ${newCount} new entries and updated ${updatedCount} existing entries. No duplicates were created.`;
        } else if (updatedCount > 0) {
          alertType = 'info';
          alertMessage = '🔄 Smart Update: All Entries Already Existed';
          alertDescription = `Updated ${updatedCount} existing entries with any changes from the CSV. No new entries were added.`;
        } else {
          alertMessage = '✅ New Entries Added';
          alertDescription = `Successfully added ${newCount} new entries to local storage.`;
        }
        
        return (
          <Alert
            message={alertMessage}
            description={alertDescription}
            type={alertType}
            showIcon
            style={{ marginBottom: '16px' }}
            action={
              <Button size="small" onClick={() => {setImportResults([]); setLastImportStats(null);}}>
                Dismiss
              </Button>
            }
          />
        );
      })()}
      
      {/* MeOS Integration Info */}
      {csvData.length > 0 && (
        <Alert
          message={meosConnected ? '🎉 MeOS Integration Ready' : '⚠️ MeOS API Not Connected'}
          description={
            <div>
              {meosConnected ? (
                <p><strong>Status:</strong> Direct MeOS REST API integration is working! Entries can be submitted directly to your MeOS competition.</p>
              ) : (
                <div>
                  <p><strong>Status:</strong> MeOS API is not reachable. Turn on MeOS REST API and click Retry.</p>
                  <Button size="small" loading={checkingMeos} onClick={checkMeos}>Retry</Button>
                </div>
              )}
              <p><strong>Workflow Options:</strong></p>
              <ol style={{ marginBottom: 0, paddingLeft: '16px' }}>
                <li><strong>Save for Check-in:</strong> Click "Save Locally" to store entries + create backup file</li>
                <li><strong>Manual Review:</strong> Use "Export CSV" if you prefer to review before saving</li>
              </ol>
              {!workingDirectory && (
                <div style={{ marginTop: '12px', padding: '8px', background: '#fff7e6', border: '1px solid #ffd666', borderRadius: '4px' }}>
                  <Text type="warning" style={{ fontSize: '12px' }}>💡 <strong>Tip:</strong> Set your working directory above to save backup files in your CSV folder!</Text>
                </div>
              )}
            </div>
          }
          type={meosConnected ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: '24px' }}
        />
      )}

      {/* Working Directory (before entries) */}
      <Card 
        title="Working Directory" 
        size="small" 
        style={{ marginBottom: '12px' }}
        type={workingDirectory ? undefined : 'inner'}
        extra={
          <Button 
            type={workingDirectory ? undefined : 'primary'}
            size="small" 
            onClick={handleSetWorkingDirectory}
            icon={<span>📁</span>}
          >
            {workingDirectory ? 'Change Directory' : 'Set Directory'}
          </Button>
        }
      >
        <div style={{ padding: '6px 0' }}>
          {workingDirectory ? (
            <div>
              <Text type="success">✓ Working directory set: <Text code>{workingDirectory}</Text></Text>
              {localEntryService.getWorkingDirectoryPath() && (
                <div style={{ marginTop: '4px' }}>
                  <Text type="secondary" style={{ fontSize: '12px' }}>Full path: <Text code>{localEntryService.getWorkingDirectoryPath()}</Text></Text>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Text type="warning">⚠️ Set your working directory to save backup files alongside your CSV.</Text>
            </div>
          )}
        </div>
      </Card>

      {/* CSV Preview Section */}
      {csvData.length > 0 && (
        <Card 
          title={`2. Preview Data (${csvData.length} entries)`}
          extra={
            <Space>
              <Button 
                icon={<span>💾</span>}
                onClick={exportForMeosImport}
                disabled={csvData.length === 0}
                title="Export CSV for manual MeOS import"
              >
                Export CSV
              </Button>
              <Button 
                type="primary" 
                icon={<UploadOutlined />}
                onClick={() => handleSaveLocally()}
                loading={importStatus.isImporting}
                disabled={csvData.length === 0}
                title="Save entries locally for check-in workflow + create backup file"
              >
                Save Locally
              </Button>
            </Space>
          }
          style={{ marginBottom: '12px' }}
        >
          <Table
            dataSource={csvData}
            columns={csvColumns}
            rowKey={(record) => record.stno || record['Entry Id'] || record.name || `row-${Math.random()}`}
            pagination={{
              ...csvPagination,
              total: csvData.length,
            }}
            onChange={handleCsvTableChange}
            size="small"
            scroll={{ x: 1000 }}
          />
        </Card>
      )}

      {/* Change Directory (after entries) */}
      {csvData.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <Space>
            <Button size="small" onClick={handleSetWorkingDirectory} icon={<span>📁</span>}>
              Change Directory
            </Button>
            {workingDirectory && (
              <Text type="secondary" style={{ fontSize: '12px' }}>Current: <Text code>{workingDirectory}</Text></Text>
            )}
          </Space>
        </div>
      )}

      {/* Import Progress Section */}
      {importStatus.isImporting && (
        <Card title="Import Progress" style={{ marginBottom: '24px' }}>
          <Progress
            percent={Math.round((importStatus.processed / importStatus.total) * 100)}
            status={importStatus.isImporting ? 'active' : 'success'}
          />
          <div style={{ marginTop: '16px' }}>
            <Space>
              <Text>Progress: {importStatus.processed} / {importStatus.total}</Text>
              <Text type="success">Success: {importStatus.successful}</Text>
              <Text type="danger">Errors: {importStatus.errors}</Text>
            </Space>
          </div>
        </Card>
      )}

      {/* Import Results Section */}
      {importResults.length > 0 && (
        <Card title="3. Import Results">
          <Table
            dataSource={importResults}
            columns={resultsColumns}
            rowKey={(record) => record.entry.stno || record.entry['Entry Id'] || `result-${Math.random()}`}
            pagination={{
              ...resultsPagination,
              total: importResults.length,
            }}
            onChange={handleResultsTableChange}
            size="small"
            scroll={{ x: 1000 }}
          />
        </Card>
      )}
    </div>
  );
};

export default JotformImport;