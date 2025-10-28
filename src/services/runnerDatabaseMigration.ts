// Runner Database Migration Tool
// Migrates data from localStorage to SQLite

import { sqliteRunnerDB, RunnerRecord } from './sqliteRunnerDatabaseService';
import { LocalRunner } from './localRunnerService';

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  skippedCount: number;
  errors: string[];
  duration: number;
}

class RunnerDatabaseMigration {
  /**
   * Migrate all runners from localStorage to SQLite
   */
  async migrateFromLocalStorage(): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      skippedCount: 0,
      errors: [],
      duration: 0
    };

    try {
      console.log('[Migration] Starting migration from localStorage to SQLite...');

      // Initialize SQLite database
      await sqliteRunnerDB.initialize();

      // Load existing localStorage data (check both old and new keys)
      let localStorageData = localStorage.getItem('local_runner_database');
      if (!localStorageData) {
        localStorageData = localStorage.getItem('runners');
      }
      
      if (!localStorageData) {
        console.log('[Migration] No localStorage data found');
        result.success = true;
        result.duration = Date.now() - startTime;
        return result;
      }

      // Parse localStorage runners
      let localRunners: LocalRunner[];
      try {
        localRunners = JSON.parse(localStorageData);
      } catch (error) {
        result.errors.push('Failed to parse localStorage data');
        result.duration = Date.now() - startTime;
        return result;
      }

      console.log(`[Migration] Found ${localRunners.length} runners in localStorage`);

      // Migrate each runner
      for (const localRunner of localRunners) {
        try {
          // Convert LocalRunner to SQLite RunnerRecord format
          const sqliteRunner: Partial<RunnerRecord> & { id: string } = {
            id: localRunner.id,
            first_name: localRunner.name.first,
            last_name: localRunner.name.last,
            birth_year: localRunner.birthYear,
            sex: localRunner.sex,
            club: localRunner.club,
            card_number: localRunner.cardNumber,
            nationality: localRunner.nationality || 'USA',
            phone: localRunner.phone,
            email: localRunner.email,
            times_used: localRunner.timesUsed,
            last_used: localRunner.lastUsed instanceof Date 
              ? localRunner.lastUsed.toISOString() 
              : new Date(localRunner.lastUsed).toISOString()
          };

          // Insert into SQLite
          sqliteRunnerDB.upsertRunner(sqliteRunner);
          result.migratedCount++;

        } catch (error) {
          result.skippedCount++;
          result.errors.push(
            `Failed to migrate runner ${localRunner.name.first} ${localRunner.name.last}: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      console.log(`[Migration] Completed: ${result.migratedCount} migrated, ${result.skippedCount} skipped in ${result.duration}ms`);

      // Backup localStorage data (don't clear the old data yet)
      if (result.migratedCount > 0) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        localStorage.setItem(`runners_backup_${timestamp}`, localStorageData);
        console.log(`[Migration] ✓ Migrated ${result.migratedCount} runners to SQLite in ${result.duration}ms`);
      }

      return result;

    } catch (error) {
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.duration = Date.now() - startTime;
      console.error('[Migration] Migration failed:', error);
      return result;
    }
  }

  /**
   * Migrate from IOF XML format
   */
  async migrateFromIOFXML(runners: any[]): Promise<MigrationResult> {
    const startTime = Date.now();
    const result: MigrationResult = {
      success: false,
      migratedCount: 0,
      skippedCount: 0,
      errors: [],
      duration: 0
    };

    try {
      console.log(`[Migration] Starting IOF XML migration for ${runners.length} runners...`);

      await sqliteRunnerDB.initialize();

      for (const runner of runners) {
        try {
          const sqliteRunner: Partial<RunnerRecord> & { id: string } = {
            id: runner.id || this.generateId(),
            first_name: runner.name?.first || runner.given || '',
            last_name: runner.name?.last || runner.family || '',
            birth_year: runner.birthYear || runner.birthDate ? new Date(runner.birthDate).getFullYear() : undefined,
            sex: runner.sex,
            club: runner.club || runner.organisation?.name,
            card_number: runner.controlCard?.[0]?.value || runner.cardNumber,
            nationality: runner.nationality?.code || 'USA'
          };

          sqliteRunnerDB.upsertRunner(sqliteRunner);
          result.migratedCount++;

        } catch (error) {
          result.skippedCount++;
          result.errors.push(`Failed to migrate runner: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;

      console.log(`[Migration] IOF XML migration completed: ${result.migratedCount} migrated, ${result.skippedCount} skipped`);

      return result;

    } catch (error) {
      result.errors.push(`IOF XML migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.duration = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Check if migration is needed
   */
  needsMigration(): boolean {
    // Check if there's localStorage data (check both keys)
    const localStorageData = localStorage.getItem('local_runner_database') || localStorage.getItem('runners');
    if (!localStorageData) return false;

    // Check if SQLite has data
    const sqliteData = localStorage.getItem('sqlite_runner_db');
    if (sqliteData) return false; // Already migrated

    return true;
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): {
    localStorageCount: number;
    sqliteCount: number;
    needsMigration: boolean;
  } {
    let localStorageCount = 0;
    let sqliteCount = 0;

    // Count localStorage runners (check both keys)
    try {
      let localStorageData = localStorage.getItem('local_runner_database');
      if (!localStorageData) {
        localStorageData = localStorage.getItem('runners');
      }
      if (localStorageData) {
        const runners = JSON.parse(localStorageData);
        localStorageCount = Array.isArray(runners) ? runners.length : 0;
      }
    } catch (error) {
      console.error('[Migration] Failed to count localStorage runners:', error);
    }

    // Count SQLite runners (approximate - would need to initialize DB)
    const sqliteData = localStorage.getItem('sqlite_runner_db');
    sqliteCount = sqliteData ? 1 : 0; // 1 means DB exists, 0 means not created yet

    return {
      localStorageCount,
      sqliteCount,
      needsMigration: localStorageCount > 0 && sqliteCount === 0
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `runner_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clear localStorage backup data (after successful migration verification)
   */
  clearBackups(): void {
    const keys = Object.keys(localStorage);
    const backupKeys = keys.filter(key => key.startsWith('runners_backup_'));
    
    backupKeys.forEach(key => {
      localStorage.removeItem(key);
      console.log(`[Migration] Removed backup: ${key}`);
    });
  }

  /**
   * Rollback migration (restore from backup)
   */
  rollback(): boolean {
    try {
      // Find most recent backup
      const keys = Object.keys(localStorage);
      const backupKeys = keys.filter(key => key.startsWith('runners_backup_')).sort().reverse();
      
      if (backupKeys.length === 0) {
        console.error('[Migration] No backup found for rollback');
        return false;
      }

      const latestBackup = backupKeys[0];
      const backupData = localStorage.getItem(latestBackup);

      if (!backupData) {
        console.error('[Migration] Backup data is empty');
        return false;
      }

      // Restore to main localStorage key
      localStorage.setItem('runners', backupData);

      // Clear SQLite database
      localStorage.removeItem('sqlite_runner_db');

      console.log(`[Migration] Rolled back to backup: ${latestBackup}`);
      return true;

    } catch (error) {
      console.error('[Migration] Rollback failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const runnerDatabaseMigration = new RunnerDatabaseMigration();
export default RunnerDatabaseMigration;
