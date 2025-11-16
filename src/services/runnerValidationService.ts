/**
 * Runner Validation Service
 * 
 * Provides reusable validation and correction logic for runner data
 * Used by Entry Dashboard during CSV import and by Results Export when validating MeOS/OE12 results
 * 
 * Checks include:
 * - Name capitalization (Title Case)
 * - Birth year validation
 * - Club affiliation matching
 * - Card number updates (excluding rented/hired cards)
 * - Duplicate detection
 */

import { sqliteRunnerDB, type RunnerRecord } from './sqliteRunnerDatabaseService';

export interface RunnerValidationDiff {
  field: 'name' | 'birthYear' | 'club' | 'cardNumber' | 'sex' | 'phone';
  currentValue?: string | number;
  suggestedValue?: string | number;
  severity: 'info' | 'warning' | 'error'; // info=minor, warning=should fix, error=critical
  reason: string;
}

export interface RunnerValidationResult {
  valid: boolean;
  diffs: RunnerValidationDiff[];
  suggestedCorrections: Partial<{
    firstName: string;
    lastName: string;
    birthYear: string;
    club: string;
    cardNumber: string;
    sex: string;
    phone: string;
  }>;
  matchedRunner?: RunnerRecord;
}

class RunnerValidationService {
  /**
   * Capitalize a name part properly (Title Case with support for special patterns)
   */
  private capitalizeNamePart(namePart: string): string {
    if (!namePart || namePart.trim() === '') return '';
    
    const trimmed = namePart.trim();
    const parts = trimmed.split(/[-'\\s]+/);
    
    return parts.map(part => {
      if (part.length === 0) return part;
      
      // Handle McNames, MacDonald patterns
      if (part.toLowerCase().startsWith('mc') && part.length > 2) {
        return part[0].toUpperCase() + 'c' + part[2].toUpperCase() + part.slice(3).toLowerCase();
      }
      if (part.toLowerCase().startsWith('mac') && part.length > 3) {
        return part[0].toUpperCase() + 'ac' + part[3].toUpperCase() + part.slice(4).toLowerCase();
      }
      
      // Standard title case
      return part[0].toUpperCase() + part.slice(1).toLowerCase();
    }).join(parts.length > 1 ? (trimmed.includes('-') ? '-' : (trimmed.includes("'") ? "'" : ' ')) : '');
  }

  /**
   * Check if name has proper capitalization
   */
  private isProperTitleCase(namePart: string): boolean {
    const trimmed = namePart.trim();
    if (!trimmed) return true;
    
    const parts = trimmed.split(/[-'\\s]+/);
    
    return parts.every(part => {
      if (part.length === 0) return true;
      
      if (part.toLowerCase().startsWith('mc') && part.length > 2) {
        return part[0] === part[0].toUpperCase() && part[1] === 'c' && part[2] === part[2].toUpperCase();
      }
      if (part.toLowerCase().startsWith('mac') && part.length > 3) {
        return part[0] === part[0].toUpperCase() && part[1] === 'a' && part[2] === 'c' && part[3] === part[3].toUpperCase();
      }
      
      return part[0] === part[0].toUpperCase() && part.slice(1) === part.slice(1).toLowerCase();
    });
  }

  /**
   * Normalize a string for comparison
   */
  private normalize(str: string): string {
    return str.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Simple Levenshtein distance for short first-name comparisons
   */
  private levenshtein(a: string, b: string): number {
    a = a.toLowerCase();
    b = b.toLowerCase();
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) dp[i][0] = i;
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[a.length][b.length];
  }

  /**
   * Decide if two first names are a fuzzy match (nicknames/abbr tolerated)
   */
  private fuzzyFirstNameMatch(f1: string, f2: string): boolean {
    const a = f1.toLowerCase().trim();
    const b = f2.toLowerCase().trim();
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.startsWith(b) || b.startsWith(a)) return true; // abbr/prefix
    if (a.includes(b) || b.includes(a)) return true; // nickname contained
    const dist = this.levenshtein(a, b);
    return dist <= 2; // allow small typos
  }

  /**
   * Find a fuzzy-matched runner by exact last name and close first name
   */
  private findFuzzyRunner(first: string, last: string): RunnerRecord | undefined {
    try {
      const all = sqliteRunnerDB.getAllRunners();
      const lname = last.toLowerCase().trim();
      const candidates = all.filter(r => (r.last_name || '').toLowerCase().trim() === lname);
      const f = first.toLowerCase().trim();
      const match = candidates.find(r => this.fuzzyFirstNameMatch(f, (r.first_name || '')));
      return match || undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Find runner in database by exact name match
   */
  private findRunnerByName(firstName: string, lastName: string): RunnerRecord | undefined {
    try {
      const r = sqliteRunnerDB.getRunnerByExactName(firstName, lastName);
      return r || undefined;
    } catch (error) {
      console.warn('[RunnerValidation] Failed to query database:', error);
      return undefined;
    }
  }

  /**
   * Validate a single runner's data
   */
  validateRunner(
    firstName: string,
    lastName: string,
    birthYear?: string | number,
    club?: string,
    cardNumber?: string | number,
    sex?: string,
    phone?: string,
    isHiredCard?: boolean
  ): RunnerValidationResult {
    const diffs: RunnerValidationDiff[] = [];
    const corrections: RunnerValidationResult['suggestedCorrections'] = {};
    
    // Find matching runner in database (exact or fuzzy)
    let dbRunner = this.findRunnerByName(firstName, lastName);
    if (!dbRunner) {
      dbRunner = this.findFuzzyRunner(firstName, lastName);
    }

    // Only recommend name changes if we have a reasonable DB match
    if (dbRunner) {
      const dbFirst = this.capitalizeNamePart(dbRunner.first_name || '');
      const dbLast = this.capitalizeNamePart(dbRunner.last_name || '');
      if (dbFirst && dbFirst !== firstName) {
        diffs.push({
          field: 'name',
          currentValue: firstName,
          suggestedValue: dbFirst,
          severity: 'warning',
          reason: 'First name differs from runner database'
        });
        corrections.firstName = dbFirst;
      }
      if (dbLast && dbLast !== lastName) {
        diffs.push({
          field: 'name',
          currentValue: lastName,
          suggestedValue: dbLast,
          severity: 'warning',
          reason: 'Last name differs from runner database'
        });
        corrections.lastName = dbLast;
      }
    }
    
    // Check birth year
    if (dbRunner?.birth_year && birthYear && String(birthYear) !== String(dbRunner.birth_year)) {
      diffs.push({
        field: 'birthYear',
        currentValue: birthYear,
        suggestedValue: dbRunner.birth_year,
        severity: 'warning',
        reason: 'Birth year mismatch with database'
      });
      corrections.birthYear = String(dbRunner.birth_year);
    }
    
    if (!birthYear && dbRunner?.birth_year) {
      diffs.push({
        field: 'birthYear',
        currentValue: undefined,
        suggestedValue: dbRunner.birth_year,
        severity: 'info',
        reason: 'Missing birth year - database has it'
      });
      corrections.birthYear = String(dbRunner.birth_year);
    }
    
    // Check club
    if (dbRunner?.club && club) {
      const normalizedDbClub = this.normalize(dbRunner.club);
      const normalizedClub = this.normalize(club);
      
      if (normalizedDbClub !== normalizedClub) {
        diffs.push({
          field: 'club',
          currentValue: club,
          suggestedValue: dbRunner.club,
          severity: 'warning',
          reason: 'Club mismatch with database'
        });
        corrections.club = dbRunner.club;
      }
    }
    
    if (!club && dbRunner?.club) {
      diffs.push({
        field: 'club',
        currentValue: undefined,
        suggestedValue: dbRunner.club,
        severity: 'info',
        reason: 'Missing club - database has it'
      });
      corrections.club = dbRunner.club;
    }
    
    // Check card number - only update if NOT a hired/rented card
    if (!isHiredCard && dbRunner?.card_number && cardNumber) {
      const dbCard = String(dbRunner.card_number);
      const currentCard = String(cardNumber);
      
      if (dbCard !== currentCard && !['0', ''].includes(currentCard)) {
        diffs.push({
          field: 'cardNumber',
          currentValue: cardNumber,
          suggestedValue: dbRunner.card_number,
          severity: 'info',
          reason: 'Card number differs from database (update if not rented)'
        });
        corrections.cardNumber = String(dbRunner.card_number);
      }
    }
    
    // Check sex
    if (dbRunner?.sex && sex && sex !== dbRunner.sex) {
      diffs.push({
        field: 'sex',
        currentValue: sex,
        suggestedValue: dbRunner.sex,
        severity: 'info',
        reason: 'Sex mismatch with database'
      });
      corrections.sex = dbRunner.sex;
    }
    
    if (!sex && dbRunner?.sex) {
      diffs.push({
        field: 'sex',
        currentValue: undefined,
        suggestedValue: dbRunner.sex,
        severity: 'info',
        reason: 'Missing sex - database has it'
      });
      corrections.sex = dbRunner.sex;
    }
    
    // Check phone
    if (dbRunner?.phone && phone) {
      const normalizedDbPhone = this.normalize(dbRunner.phone);
      const normalizedPhone = this.normalize(phone);
      
      if (normalizedDbPhone !== normalizedPhone) {
        diffs.push({
          field: 'phone',
          currentValue: phone,
          suggestedValue: dbRunner.phone,
          severity: 'info',
          reason: 'Phone number mismatch with database'
        });
        corrections.phone = dbRunner.phone;
      }
    }
    
    if (!phone && dbRunner?.phone) {
      diffs.push({
        field: 'phone',
        currentValue: undefined,
        suggestedValue: dbRunner.phone,
        severity: 'info',
        reason: 'Missing phone - database has it'
      });
      corrections.phone = dbRunner.phone;
    }
    
    // Determine if validation passed
    const valid = diffs.every(d => d.severity === 'info');
    
    return {
      valid,
      diffs,
      suggestedCorrections: corrections,
      matchedRunner: dbRunner
    };
  }

  /**
   * Validate multiple runners
   */
  validateRunners(runners: Array<{
    firstName: string;
    lastName: string;
    birthYear?: string | number;
    club?: string;
    cardNumber?: string | number;
    sex?: string;
    phone?: string;
    isHiredCard?: boolean;
  }>): Array<RunnerValidationResult & { runnerName: string; index: number }> {
    return runners.map((runner, index) => ({
      runnerName: `${runner.firstName} ${runner.lastName}`,
      index,
      ...this.validateRunner(
        runner.firstName,
        runner.lastName,
        runner.birthYear,
        runner.club,
        runner.cardNumber,
        runner.sex,
        runner.phone,
        runner.isHiredCard
      )
    }));
  }

  /**
   * Get validation summary for a batch of runners
   */
  getValidationSummary(validationResults: RunnerValidationResult[]): {
    totalRunners: number;
    validRunners: number;
    invalidRunners: number;
    totalDifferences: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  } {
    let validCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    
    validationResults.forEach(result => {
      if (result.valid) validCount++;
      
      result.diffs.forEach(diff => {
        if (diff.severity === 'error') errorCount++;
        else if (diff.severity === 'warning') warningCount++;
        else infoCount++;
      });
    });
    
    return {
      totalRunners: validationResults.length,
      validRunners: validCount,
      invalidRunners: validationResults.length - validCount,
      totalDifferences: validationResults.reduce((sum, r) => sum + r.diffs.length, 0),
      errorCount,
      warningCount,
      infoCount
    };
  }

  /**
   * Export validation report as text
   */
  generateValidationReport(validationResults: Array<RunnerValidationResult & { runnerName: string; index: number }>): string {
    const summary = this.getValidationSummary(validationResults);
    
    let report = 'RUNNER VALIDATION REPORT\\n';
    report += '========================\\n\\n';
    
    report += `Total Runners: ${summary.totalRunners}\\n`;
    report += `Valid Runners: ${summary.validRunners}\\n`;
    report += `Runners with Issues: ${summary.invalidRunners}\\n`;
    report += `Total Differences Found: ${summary.totalDifferences}\\n`;
    report += `  - Errors: ${summary.errorCount}\\n`;
    report += `  - Warnings: ${summary.warningCount}\\n`;
    report += `  - Info: ${summary.infoCount}\\n\\n`;
    
    report += 'DETAILED RESULTS\\n';
    report += '================\\n\\n';
    
    validationResults.forEach(result => {
      if (result.diffs.length === 0) return;
      
      report += `${result.index + 1}. ${result.runnerName}\\n`;
      
      result.diffs.forEach(diff => {
        const severity = `[${diff.severity.toUpperCase()}]`;
        report += `   ${severity} ${diff.field}: ${diff.reason}\\n`;
        report += `       Current: ${diff.currentValue ?? '(empty)'}\\n`;
        report += `       Suggested: ${diff.suggestedValue ?? '(empty)'}\\n`;
      });
      
      report += '\\n';
    });
    
    return report;
  }
}

export const runnerValidationService = new RunnerValidationService();