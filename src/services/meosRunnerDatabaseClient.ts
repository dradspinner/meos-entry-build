// Client service for MeOS Runner Database using IOF-XML format
// This uses the IOF-XML service in browser memory instead of the Node.js service

import { iofRunnerDatabaseService } from './iofRunnerDatabaseService';

export interface MeosRunner {
  id: string;
  name: {
    first: string;
    last: string;
  };
  club: string;
  clubNo?: number;
  birthYear?: number;
  sex?: 'M' | 'F';
  cardNumber?: number;
  nationality?: string;
  extId: string;
}

export interface DatabaseStats {
  totalRunners: number;
  filePath?: string;
  lastModified?: Date;
  lastChecked: Date;
}

class MeosRunnerDatabaseClient {
  private isInitialized = false;

  /**
   * Initialize the service if not already done
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await iofRunnerDatabaseService.initialize();
      this.isInitialized = true;
    }
  }

  /**
   * Check if the database service is available (has runner data)
   */
  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      const isAvailable = iofRunnerDatabaseService.isAvailable();
      console.log(`[MeosRunnerDB] IOF-XML service available: ${isAvailable}`);
      return isAvailable;
    } catch (error) {
      console.error('[MeosRunnerDB] Failed to check availability:', error);
      return false;
    }
  }

  /**
   * Search for runners by name
   */
  async searchRunners(searchName: string, limit: number = 50): Promise<MeosRunner[]> {
    if (!searchName || searchName.trim().length < 2) {
      return [];
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error('MeOS Runner Database is not available. Please load IOF-XML data first.');
    }

    try {
      await this.ensureInitialized();
      const runners = iofRunnerDatabaseService.searchRunners(searchName.trim(), limit);
      
      // Convert to MeosRunner format for compatibility
      const meosRunners: MeosRunner[] = runners.map(runner => ({
        id: runner.id,
        name: runner.name,
        club: runner.club,
        clubNo: runner.clubNo,
        birthYear: runner.birthYear,
        sex: runner.sex,
        cardNumber: runner.cardNumber,
        nationality: runner.nationality || '',
        extId: runner.extId
      }));
      
      console.log(`[MeosRunnerDB] Found ${meosRunners.length} runners matching "${searchName}"`);
      return meosRunners;
      
    } catch (error) {
      console.error('[MeosRunnerDB] Search failed:', error);
      throw error;
    }
  }

  /**
   * Get all runners (for bulk operations)
   */
  async getAllRunners(): Promise<MeosRunner[]> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('MeOS Runner Database is not available. Please load IOF-XML data first.');
    }

    try {
      await this.ensureInitialized();
      const runners = iofRunnerDatabaseService.getAllRunners();
      
      // Convert to MeosRunner format for compatibility
      const meosRunners: MeosRunner[] = runners.map(runner => ({
        id: runner.id,
        name: runner.name,
        club: runner.club,
        clubNo: runner.clubNo,
        birthYear: runner.birthYear,
        sex: runner.sex,
        cardNumber: runner.cardNumber,
        nationality: runner.nationality || '',
        extId: runner.extId
      }));
      
      console.log(`[MeosRunnerDB] Retrieved ${meosRunners.length} total runners from IOF-XML database`);
      return meosRunners;
      
    } catch (error) {
      console.error('[MeosRunnerDB] Failed to get all runners:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<DatabaseStats> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error('MeOS Runner Database is not available. Please load IOF-XML data first.');
    }

    try {
      await this.ensureInitialized();
      const stats = iofRunnerDatabaseService.getStats();
      
      // Convert to DatabaseStats format for compatibility
      const dbStats: DatabaseStats = {
        totalRunners: stats.totalRunners,
        filePath: stats.sourceFile,
        lastModified: stats.lastUpdated,
        lastChecked: new Date() // Current time as "last checked"
      };
      
      return dbStats;
      
    } catch (error) {
      console.error('[MeosRunnerDB] Failed to get stats:', error);
      throw error;
    }
  }

  /**
   * Load runners from IOF-XML file
   */
  async loadFromIOFXML(file: File): Promise<{ success: boolean; message: string; stats: DatabaseStats }> {
    console.log('[MeosRunnerDB] Loading runners from IOF-XML file...');
    
    try {
      await this.ensureInitialized();
      const result = await iofRunnerDatabaseService.loadFromIOFXML(file);
      
      // Convert stats for compatibility
      const dbStats: DatabaseStats = {
        totalRunners: result.stats.totalRunners,
        filePath: result.stats.sourceFile,
        lastModified: result.stats.lastUpdated,
        lastChecked: new Date()
      };
      
      return {
        success: result.success,
        message: result.message,
        stats: dbStats
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MeosRunnerDB] Failed to load from IOF-XML:', errorMessage);
      
      return {
        success: false,
        message: `Failed to load runners: ${errorMessage}`,
        stats: {
          totalRunners: 0,
          lastChecked: new Date()
        }
      };
    }
  }
  
  /**
   * Bulk populate local runner service from loaded IOF-XML database
   */
  async populateLocalRunnerService(): Promise<{ imported: number, updated: number, errors: string[] }> {
    console.log('[MeosRunnerDB] Starting bulk population from IOF-XML database...');
    
    try {
      const meosRunners = await this.getAllRunners();
      
      if (meosRunners.length === 0) {
        return { imported: 0, updated: 0, errors: ['No runners found in IOF-XML database'] };
      }

      // Convert MeOS runners to local runner format
      const { localRunnerService } = await import('./localRunnerService');
      
      const localRunnerData = meosRunners.map(meosRunner => ({
        name: meosRunner.name,
        club: meosRunner.club || '',
        birthYear: meosRunner.birthYear,
        sex: meosRunner.sex,
        cardNumber: meosRunner.cardNumber,
        nationality: meosRunner.nationality,
        phone: '',
        email: '',
      }));

      const result = localRunnerService.bulkLearnFromEntries(localRunnerData);
      
      console.log(`[MeosRunnerDB] Bulk population complete: ${result.imported} imported, ${result.updated} updated`);
      
      return {
        imported: result.imported,
        updated: result.updated,
        errors: []
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[MeosRunnerDB] Bulk population failed:', errorMessage);
      
      return {
        imported: 0,
        updated: 0,
        errors: [errorMessage]
      };
    }
  }

  /**
   * Get setup instructions for IOF-XML workflow
   */
  getSetupInstructions(): string[] {
    return [
      '📤 EXPORT FROM MeOS:',
      '1. Open MeOS on this computer',
      '2. Go to Lists → Competitors → Export',
      '3. Choose "IOF-XML 3.0" format',
      '4. Save the file (e.g., "MeOS Runner database.xml")',
      '',
      '📥 LOAD INTO APP:',
      '1. Click "Load IOF-XML File" button below',
      '2. Browse and select your exported XML file',
      '3. The app will load all runners into memory',
      '',
      '✅ What this enables:',
      '• Fast lookups from your complete MeOS runner history',
      '• Auto-completion using runners from ALL your past events',
      '• Works entirely in your browser - no external services needed',
      '• Data persists between sessions',
      '',
      '🔄 TO UPDATE:',
      '• Export fresh IOF-XML from MeOS anytime',
      '• Load the new file to update your runner database',
      '• All previous data will be replaced with latest export'
    ];
  }
}

export const meosRunnerDatabaseClient = new MeosRunnerDatabaseClient();
export default MeosRunnerDatabaseClient;