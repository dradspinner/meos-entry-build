/**
 * MeOS Results Validation Service
 * 
 * Handles connection to MeOS server and validation/correction of runner entries
 * before exporting results as HTML or XML
 * 
 * Uses runnerValidationService to apply the same checks used during CSV import
 */

import { runnerValidationService, type RunnerValidationResult } from './runnerValidationService';
import { meosApi } from './meosApi';

export interface MeOSConnectionConfig {
  host: string;
  port?: number;
  database?: string;
  timeout?: number;
}

export interface MeOSRunnerEntry {
  id: string;
  firstName: string;
  lastName: string;
  birthYear?: number;
  club?: string;
  cardNumber?: string | number;
  sex?: string;
  phone?: string;
  className: string;
  isHiredCard?: boolean;
}

export interface ValidationBatch {
  eventName: string;
  eventDate: string;
  runners: MeOSRunnerEntry[];
  validationResults: Array<RunnerValidationResult & { runner: MeOSRunnerEntry; index: number }>;
}

class MeOSResultsValidationService {
  private meosConfig: MeOSConnectionConfig | null = null;
  private isConnected: boolean = false;

  /**
   * Set MeOS connection configuration
   */
  setMeOSConfig(config: MeOSConnectionConfig): void {
    this.meosConfig = config;
    console.log('[MeOSValidation] MeOS config set:', {
      host: config.host,
      port: config.port || 3306,
      database: config.database || 'MeOS'
    });
  }

  /**
   * Test connection to MeOS
   */
  async testMeOSConnection(): Promise<boolean> {
    if (!this.meosConfig) {
      console.log('[MeOSValidation] No MeOS config set');
      return false;
    }

    try {
      console.log('[MeOSValidation] Testing MeOS connection...');
      
      // Try to connect to MeOS
      // This would use IPC to Electron main process which has database access
      if (window.electronAPI && typeof window.electronAPI.meosTest === 'function') {
        const result = await window.electronAPI.meosTest(this.meosConfig);
        this.isConnected = result;
        console.log('[MeOSValidation] Connection test result:', result);
        return result;
      }
      
      return false;
    } catch (error) {
      console.error('[MeOSValidation] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Detect if event was run in MeOS
   */
  async detectEventSource(xmlContent: string): Promise<'MeOS' | 'OE12' | 'unknown'> {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    
    // Check for MeOS-specific XML markers
    const iofVersion = xmlDoc.documentElement?.getAttribute('iofVersion') || xmlDoc.querySelector('Event')?.getAttribute('iofVersion');
    const creator = xmlDoc.querySelector('Event > Creator')?.textContent?.toLowerCase() || '';
    
    console.log('[MeOSValidation] XML metadata:', { iofVersion, creator });
    
    if (creator.includes('meos')) {
      return 'MeOS';
    }
    
    if (creator.includes('oe12') || creator.includes('orienteering event')) {
      return 'OE12';
    }
    
    // Try to detect from structure
    const classResults = xmlDoc.querySelectorAll('ClassResult');
    if (classResults.length > 0) {
      // Check if it has MeOS-specific fields
      const firstRunner = classResults[0].querySelector('PersonResult');
      if (firstRunner) {
        const meosFields = firstRunner.querySelector('[meosId]');
        if (meosFields) {
          return 'MeOS';
        }
      }
    }
    
    return 'unknown';
  }

  /**
   * Retrieve runner entries from MeOS for a specific event
   */
  async getMeOSRunners(eventId: string): Promise<MeOSRunnerEntry[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to MeOS. Call testMeOSConnection first.');
    }

    try {
      if (window.electronAPI && typeof window.electronAPI.meosGetRunners === 'function') {
        const runners = await window.electronAPI.meosGetRunners(eventId);
        console.log(`[MeOSValidation] Retrieved ${runners.length} runners from MeOS`);
        return runners;
      }
      
      throw new Error('MeOS API not available');
    } catch (error) {
      console.error('[MeOSValidation] Failed to retrieve runners from MeOS:', error);
      throw error;
    }
  }

  /**
   * Fetch competitors directly from MeOS API, validate, and return a batch
   */
  async validateFromMeOSAPI(eventName: string, eventDate: string): Promise<ValidationBatch> {
    // Use entries endpoint to get rich person data (YB, Sex, Club)
    let entries = await meosApi.getAllEntries();
    if (!entries || entries.length === 0) {
      // Fallback to competitors endpoint if entries not available
      const competitors = await meosApi.getAllCompetitors();
      // Enrich competitor data with detailed lookup to get proper club names
      const enriched: any[] = [];
      for (const c of competitors) {
        let club = '';
        try {
          const detail = await meosApi.lookupCompetitorById({ id: c.id });
          club = detail?.club || '';
        } catch {}
        enriched.push({
          id: c.id,
          name: { first: (c.name || '').split(' ')[0] || '', last: (c.name || '').split(' ').slice(1).join(' ') || '' },
          birthYear: c.birthYear,
          club,
          cardNumber: c.cardNumber,
          sex: c.sex,
          class: { id: c.classId, name: String(c.classId || '') }
        });
      }
      entries = enriched;
    }
    const runners: MeOSRunnerEntry[] = entries.map((e: any) => ({
      id: String(e.id || `${e.name?.first || ''}_${e.name?.last || ''}`),
      firstName: e.name?.first || '',
      lastName: e.name?.last || '',
      birthYear: e.birthYear ? Number(e.birthYear) : undefined,
      club: e.club || '',
      cardNumber: e.cardNumber ? Number(e.cardNumber) : undefined,
      sex: e.sex || undefined,
      className: e.class?.name || String(e.class?.id || ''),
      isHiredCard: false,
    }));

    const validationResults = runners.map((runner, index) => ({
      runner,
      index,
      ...runnerValidationService.validateRunner(
        runner.firstName,
        runner.lastName,
        runner.birthYear,
        runner.club,
        runner.cardNumber,
        runner.sex,
        undefined,
        runner.isHiredCard
      )
    }));

    return { eventName, eventDate, runners, validationResults };
  }

  /**
   * Validate runners from MeOS results XML
   */
  async validateMeOSResultsXML(
    xmlContent: string,
    eventName: string,
    eventDate: string
  ): Promise<ValidationBatch> {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    // Parse all runners from XML
    const runners: MeOSRunnerEntry[] = [];
    const classResults = xmlDoc.querySelectorAll('ClassResult');

    classResults.forEach(classResult => {
      const className = classResult.querySelector('Class > Name')?.textContent?.trim() || 'Unknown';
      const personResults = classResult.querySelectorAll('PersonResult');

      personResults.forEach(personResult => {
        const person = personResult.querySelector('Person');
        const result = personResult.querySelector('Result');

        if (person && result) {
          const firstName = person.querySelector('Name > Given')?.textContent?.trim() || '';
          const lastName = person.querySelector('Name > Family')?.textContent?.trim() || '';
          const birthYear = parseInt(person.querySelector('BirthYear')?.textContent || '0') || undefined;
          const club = personResult.querySelector('Organisation > Name')?.textContent?.trim() || '';
          const cardNumber = result.querySelector('CompetitorChip > Number')?.textContent?.trim() || '';
          const rented = result.querySelector('CompetitorChip')?.getAttribute('rentCardId') ? true : false;

          runners.push({
            id: person.querySelector('Id')?.textContent?.trim() || `${firstName}_${lastName}`,
            firstName,
            lastName,
            birthYear,
            club,
            cardNumber: cardNumber || undefined,
            className,
            isHiredCard: rented
          });
        }
      });
    });

    console.log(`[MeOSValidation] Parsed ${runners.length} runners from XML`);

    // Validate each runner
    const validationResults = runners.map((runner, index) => ({
      runner,
      index,
      ...runnerValidationService.validateRunner(
        runner.firstName,
        runner.lastName,
        runner.birthYear,
        runner.club,
        runner.cardNumber,
        undefined,
        undefined,
        runner.isHiredCard
      )
    }));

    const summary = runnerValidationService.getValidationSummary(
      validationResults.map(r => ({
        valid: r.valid,
        diffs: r.diffs,
        suggestedCorrections: r.suggestedCorrections,
        matchedRunner: r.matchedRunner
      }))
    );

    console.log('[MeOSValidation] Validation summary:', summary);

    return {
      eventName,
      eventDate,
      runners,
      validationResults
    };
  }

  /**
   * Push corrections back to MeOS via REST API
   * Returns summary of applied updates
   */
  async pushCorrectionsToMeOS(
    validationBatch: ValidationBatch,
    autoFixLevel: 'none' | 'info' | 'warning' | 'all' = 'all'
  ): Promise<{ attempted: number; applied: number; errors: number; details: Array<{ id: string; ok: boolean; error?: string }> }> {
    const details: Array<{ id: string; ok: boolean; error?: string }> = [];
    let attempted = 0;
    let applied = 0;
    let errors = 0;

    for (const result of validationBatch.validationResults) {
      const applicable =
        autoFixLevel === 'all' ||
        (autoFixLevel === 'warning' && result.diffs.some(d => d.severity === 'warning')) ||
        (autoFixLevel === 'info' && result.diffs.length > 0);
      if (!applicable) continue;

      attempted++;
      try {
        const ok = await this.updateCompetitorInMeOS(result.runner.id, result.suggestedCorrections, result.runner.isHiredCard);
        details.push({ id: result.runner.id, ok });
        if (ok) applied++; else errors++;
      } catch (e: any) {
        details.push({ id: result.runner.id, ok: false, error: e?.message || 'update failed' });
        errors++;
      }
    }

    return { attempted, applied, errors, details };
  }

  /**
   * Apply corrections to XML and return corrected content
   */
  applyCorrectionToXML(
    xmlContent: string,
    validationBatch: ValidationBatch,
    autoFixLevel: 'none' | 'info' | 'warning' | 'all' = 'all'
  ): string {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
    const serializer = new XMLSerializer();

    // Build a map of corrections by runner ID
    const correctionMap = new Map<string, any>();
    
    validationBatch.validationResults.forEach(result => {
      if (autoFixLevel === 'none') return;
      
      const shouldFix = 
        autoFixLevel === 'all' ||
        (autoFixLevel === 'warning' && result.diffs.some(d => d.severity === 'warning')) ||
        (autoFixLevel === 'info' && result.diffs.length > 0);

      if (shouldFix && result.suggestedCorrections) {
        correctionMap.set(result.runner.id, result.suggestedCorrections);
      }
    });

    // Apply corrections to XML
    xmlDoc.querySelectorAll('PersonResult').forEach(personResult => {
      const person = personResult.querySelector('Person');
      if (!person) return;

      const runnerId = person.querySelector('Id')?.textContent?.trim();
      if (!runnerId || !correctionMap.has(runnerId)) return;

      const corrections = correctionMap.get(runnerId);
      console.log(`[MeOSValidation] Applying corrections to runner ${runnerId}:`, corrections);

      // Apply name corrections
      if (corrections.firstName) {
        const givenElement = person.querySelector('Name > Given');
        if (givenElement) givenElement.textContent = corrections.firstName;
      }
      if (corrections.lastName) {
        const familyElement = person.querySelector('Name > Family');
        if (familyElement) familyElement.textContent = corrections.lastName;
      }

      // Apply other corrections
      if (corrections.birthYear) {
        let birthYearElement = person.querySelector('BirthYear');
        if (!birthYearElement) {
          birthYearElement = xmlDoc.createElement('BirthYear');
          person.appendChild(birthYearElement);
        }
        birthYearElement.textContent = corrections.birthYear;
      }

      if (corrections.club) {
        let orgElement = personResult.querySelector('Organisation');
        if (!orgElement) {
          orgElement = xmlDoc.createElement('Organisation');
          personResult.appendChild(orgElement);
        }
        let orgName = orgElement.querySelector('Name');
        if (!orgName) {
          orgName = xmlDoc.createElement('Name');
          orgElement.appendChild(orgName);
        }
        orgName.textContent = corrections.club;
      }

      if (corrections.cardNumber && !personResult.querySelector('Result > CompetitorChip')?.getAttribute('rentCardId')) {
        const result = personResult.querySelector('Result');
        if (result) {
          let chip = result.querySelector('CompetitorChip');
          if (!chip) {
            chip = xmlDoc.createElement('CompetitorChip');
            result.appendChild(chip);
          }
          let number = chip.querySelector('Number');
          if (!number) {
            number = xmlDoc.createElement('Number');
            chip.appendChild(number);
          }
          number.textContent = String(corrections.cardNumber);
        }
      }
    });

    return serializer.serializeToString(xmlDoc);
  }

  /**
   * Update a single competitor in MeOS
   */
  private async updateCompetitorInMeOS(
    competitorId: string,
    corrections: Partial<{ firstName: string; lastName: string; birthYear: string; club: string; cardNumber: string; sex: string; phone: string; }>,
    isHiredCard?: boolean
  ): Promise<boolean> {
    const idNum = parseInt(competitorId);
    if (!idNum || !corrections) return false;

    const updates: any = {};
    if (corrections.firstName || corrections.lastName) {
      const fname = corrections.firstName || '';
      const lname = corrections.lastName || '';
      updates.name = `${fname} ${lname}`.trim();
    }
    if (corrections.club !== undefined) updates.club = corrections.club;
    if (corrections.birthYear !== undefined) updates.birthYear = parseInt(String(corrections.birthYear));
    if (corrections.sex !== undefined) updates.sex = corrections.sex;
    if (!isHiredCard && corrections.cardNumber !== undefined) updates.cardNumber = corrections.cardNumber;

    if (Object.keys(updates).length === 0) return true; // Nothing to update

    const resp = await meosApi.updateCompetitorFields(idNum, updates);
    return !!resp.success;
  }

  /**
   * Update Runner DB using event data (add new or fill missing fields)
   */
  async updateRunnerDBFromBatch(validationBatch: ValidationBatch): Promise<{ updated: number; created: number; skipped: number; }> {
    const { sqliteRunnerDB } = await import('./sqliteRunnerDatabaseService');
    let updated = 0, created = 0, skipped = 0;

    for (const vr of validationBatch.validationResults) {
      const r = vr.runner;
      // Skip groups or missing names
      if (!r.lastName || !r.firstName) { skipped++; continue; }

      try {
        // Will create if not exists, or update fields
        const cardNum = r.cardNumber ? parseInt(String(r.cardNumber)) : undefined;
        sqliteRunnerDB.updateRunnerFromEntry(
          r.firstName,
          r.lastName,
          r.birthYear ? Number(r.birthYear) : undefined,
          (r.sex as any) || undefined,
          r.club || '',
          cardNum && !isNaN(cardNum) && cardNum > 0 ? cardNum : undefined,
          false
        );
        // Heuristic: count as updated if there were diffs, else created if no DB match
        if (vr.matchedRunner) updated++; else created++;
      } catch {
        skipped++;
      }
    }

    return { updated, created, skipped };
  }

  /**
   * Generate validation report for user review
   */
  generateValidationReport(validationBatch: ValidationBatch): string {
    const summary = runnerValidationService.getValidationSummary(
      validationBatch.validationResults.map(r => ({
        valid: r.valid,
        diffs: r.diffs,
        suggestedCorrections: r.suggestedCorrections,
        matchedRunner: r.matchedRunner
      }))
    );

    let report = `MEOS RESULTS VALIDATION REPORT\n`;
    report += `===============================\n\n`;

    report += `Event: ${validationBatch.eventName}\n`;
    report += `Date: ${validationBatch.eventDate}\n`;
    report += `Total Runners: ${summary.totalRunners}\n`;
    report += `Valid Runners: ${summary.validRunners}\n`;
    report += `Runners with Issues: ${summary.invalidRunners}\n`;
    report += `Total Differences: ${summary.totalDifferences}\n`;
    report += `  - Errors: ${summary.errorCount}\n`;
    report += `  - Warnings: ${summary.warningCount}\n`;
    report += `  - Info: ${summary.infoCount}\n\n`;

    report += `RUNNERS NEEDING CORRECTION:\n`;
    report += `============================\n\n`;

    validationBatch.validationResults
      .filter(r => r.diffs.length > 0)
      .forEach(result => {
        report += `${result.index + 1}. ${result.runner.firstName} ${result.runner.lastName}\n`;
        report += `   Class: ${result.runner.className}\n`;
        report += `   Club: ${result.runner.club || '(none)'}\n\n`;

        result.diffs.forEach(diff => {
          const severity = `[${diff.severity.toUpperCase()}]`.padEnd(8);
          report += `   ${severity} ${diff.reason}\n`;
          report += `       Current: ${diff.currentValue ?? '(empty)'}\n`;
          report += `       Suggested: ${diff.suggestedValue ?? '(empty)'}\n`;
        });

        report += '\n';
      });

    return report;
  }
}

export const meosResultsValidationService = new MeOSResultsValidationService();

// Extend window interface for Electron IPC
declare global {
  interface Window {
    // Merge with existing electronAPI type by using any augmentation
    electronAPI?: any & {
      meosTest?: (config: MeOSConnectionConfig) => Promise<boolean>;
      meosGetRunners?: (eventId: string) => Promise<MeOSRunnerEntry[]>;
    };
  }
}
