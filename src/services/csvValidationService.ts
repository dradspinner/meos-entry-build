// CSV Validation Service
// Compares OE12 XML results against runner database and identifies discrepancies

import { sqliteRunnerDB, RunnerRecord } from './sqliteRunnerDatabaseService';
import { ClassResult, RunnerResult } from './resultsExportService';

export interface RunnerValidation {
  // Original data from XML
  xmlRunner: RunnerResult;
  classId: string;
  className: string;
  
  // Database match (if found)
  dbRunner?: RunnerRecord;
  
  // Discrepancies
  discrepancies: {
    name: boolean;
    yearOfBirth: boolean;
    club: boolean;
  };
  
  // Corrected values (set by user during review)
  correctedData?: {
    firstName: string;
    lastName: string;
    yearOfBirth?: number;
    club?: string;
  };
}

export interface ValidationResult {
  totalRunners: number;
  matchedInDb: number;
  nameDiscrepancies: number;
  yobDiscrepancies: number;
  clubDiscrepancies: number;
  validations: RunnerValidation[];
}

class CSVValidationService {
  
  /**
   * Validate all runners from results against the database
   */
  async validateResults(classResults: ClassResult[]): Promise<ValidationResult> {
    const validations: RunnerValidation[] = [];
    let matchedInDb = 0;
    let nameDiscrepancies = 0;
    let yobDiscrepancies = 0;
    let clubDiscrepancies = 0;
    
    // Ensure database is initialized
    try {
      await sqliteRunnerDB.initialize();
    } catch (error) {
      console.error('[CSVValidation] Database initialization failed:', error);
    }
    
    // Process each class
    for (const classResult of classResults) {
      for (const runner of classResult.runners) {
        const validation = await this.validateRunner(runner, classResult.classId, classResult.className);
        validations.push(validation);
        
        if (validation.dbRunner) {
          matchedInDb++;
        }
        
        if (validation.discrepancies.name) nameDiscrepancies++;
        if (validation.discrepancies.yearOfBirth) yobDiscrepancies++;
        if (validation.discrepancies.club) clubDiscrepancies++;
      }
    }
    
    return {
      totalRunners: validations.length,
      matchedInDb,
      nameDiscrepancies,
      yobDiscrepancies,
      clubDiscrepancies,
      validations
    };
  }
  
  /**
   * Validate a single runner against the database
   */
  private async validateRunner(
    xmlRunner: RunnerResult,
    classId: string,
    className: string
  ): Promise<RunnerValidation> {
    let dbRunner: RunnerRecord | undefined;
    
    // Try to find runner in database using exact name match (same as EntryReviewAndFix)
    if (xmlRunner.firstName && xmlRunner.lastName) {
      try {
        const match = sqliteRunnerDB.getRunnerByExactName(xmlRunner.firstName, xmlRunner.lastName);
        dbRunner = match || undefined;
      } catch (error) {
        console.error(`[CSVValidation] Error searching for ${xmlRunner.firstName} ${xmlRunner.lastName}:`, error);
      }
    }
    
    // Check for discrepancies
    const discrepancies = {
      name: false,
      yearOfBirth: false,
      club: false
    };
    
    if (dbRunner) {
      // Name comparison
      const xmlFullName = this.normalizeString(`${xmlRunner.firstName} ${xmlRunner.lastName}`);
      const dbFullName = this.normalizeString(`${dbRunner.first_name} ${dbRunner.last_name}`);
      discrepancies.name = xmlFullName !== dbFullName;
      
      // Year of birth comparison
      if (xmlRunner.yearOfBirth && dbRunner.birth_year) {
        discrepancies.yearOfBirth = xmlRunner.yearOfBirth !== dbRunner.birth_year;
      } else if (!xmlRunner.yearOfBirth && dbRunner.birth_year) {
        discrepancies.yearOfBirth = true; // XML missing YOB but DB has it
      }
      
      // Club comparison
      if (xmlRunner.club && dbRunner.club) {
        discrepancies.club = this.normalizeString(xmlRunner.club) !== this.normalizeString(dbRunner.club);
      } else if (!xmlRunner.club && dbRunner.club) {
        discrepancies.club = true; // XML missing club but DB has it
      }
    }
    
    return {
      xmlRunner,
      classId,
      className,
      dbRunner,
      discrepancies
    };
  }
  
  /**
   * Apply corrections to a validation
   */
  applyCorrection(validation: RunnerValidation, source: 'xml' | 'db' | 'custom', customData?: Partial<RunnerValidation['correctedData']>): RunnerValidation {
    if (source === 'xml') {
      validation.correctedData = {
        firstName: validation.xmlRunner.firstName || '',
        lastName: validation.xmlRunner.lastName || '',
        yearOfBirth: validation.xmlRunner.yearOfBirth,
        club: validation.xmlRunner.club
      };
    } else if (source === 'db' && validation.dbRunner) {
      validation.correctedData = {
        firstName: validation.dbRunner.first_name || '',
        lastName: validation.dbRunner.last_name || '',
        yearOfBirth: validation.dbRunner.birth_year,
        club: validation.dbRunner.club
      };
    } else if (source === 'custom' && customData) {
      validation.correctedData = {
        firstName: customData.firstName || validation.xmlRunner.firstName || '',
        lastName: customData.lastName || validation.xmlRunner.lastName || '',
        yearOfBirth: customData.yearOfBirth,
        club: customData.club
      };
    }
    
    return validation;
  }
  
  /**
   * Get the final data for a runner (corrected or original)
   */
  getFinalData(validation: RunnerValidation): {
    firstName: string;
    lastName: string;
    yearOfBirth?: number;
    club?: string;
  } {
    return validation.correctedData || {
      firstName: validation.xmlRunner.firstName || '',
      lastName: validation.xmlRunner.lastName || '',
      yearOfBirth: validation.xmlRunner.yearOfBirth,
      club: validation.xmlRunner.club
    };
  }
  
  /**
   * Normalize string for comparison (trim, lowercase, remove extra spaces)
   */
  private normalizeString(str: string | undefined): string {
    if (!str) return '';
    return str.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}

export const csvValidationService = new CSVValidationService();
export default CSVValidationService;
