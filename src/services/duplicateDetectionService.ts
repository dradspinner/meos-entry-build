// Duplicate Detection Service for Runner Database
// Uses Levenshtein distance and phonetic matching to find potential duplicates

export interface DuplicateGroup {
  id: string;
  runners: any[];
  similarity: number;
  reason: string;
}

export interface DuplicateStats {
  totalRunners: number;
  potentialDuplicates: number;
  duplicateGroups: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
}

class DuplicateDetectionService {
  
  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Calculate similarity percentage between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    const maxLength = Math.max(str1.length, str2.length);
    
    if (maxLength === 0) return 100;
    
    return ((maxLength - distance) / maxLength) * 100;
  }

  /**
   * Create a phonetic key for a name (simplified Soundex-like algorithm)
   */
  private phoneticKey(name: string): string {
    // Remove common variations
    let key = name.toLowerCase()
      .replace(/[^a-z]/g, '')
      .replace(/ph/g, 'f')
      .replace(/ck/g, 'k')
      .replace(/sh/g, 's')
      .replace(/ch/g, 'k');
    
    // Remove consecutive duplicates
    key = key.replace(/(.)\1+/g, '$1');
    
    return key;
  }

  /**
   * Check if two names are phonetically similar
   */
  private arePhoneticallySimilar(name1: string, name2: string): boolean {
    const key1 = this.phoneticKey(name1);
    const key2 = this.phoneticKey(name2);
    
    const similarity = this.calculateSimilarity(key1, key2);
    return similarity >= 70;
  }

  /**
   * Normalize a name for comparison
   */
  private normalizeName(first: string, last: string): string {
    return `${first.toLowerCase().trim()} ${last.toLowerCase().trim()}`;
  }

  /**
   * Find potential duplicate runners
   */
  findDuplicates(runners: any[], threshold: number = 85): DuplicateGroup[] {
    console.log(`[DuplicateDetection] Analyzing ${runners.length} runners for duplicates...`);
    
    const duplicateGroups: DuplicateGroup[] = [];
    const processed = new Set<string>();
    
    for (let i = 0; i < runners.length; i++) {
      const runner1 = runners[i];
      const id1 = runner1.id || i.toString();
      
      if (processed.has(id1)) continue;
      
      const group: any[] = [runner1];
      const reasons: string[] = [];
      
      const name1 = this.normalizeName(runner1.name.first, runner1.name.last);
      
      for (let j = i + 1; j < runners.length; j++) {
        const runner2 = runners[j];
        const id2 = runner2.id || j.toString();
        
        if (processed.has(id2)) continue;
        
        const name2 = this.normalizeName(runner2.name.first, runner2.name.last);
        
        // Check for exact match (case-insensitive)
        if (name1 === name2) {
          group.push(runner2);
          processed.add(id2);
          reasons.push('Exact name match');
          continue;
        }
        
        // Check name similarity
        const similarity = this.calculateSimilarity(name1, name2);
        
        if (similarity >= threshold) {
          group.push(runner2);
          processed.add(id2);
          reasons.push(`${similarity.toFixed(0)}% name similarity`);
          continue;
        }
        
        // Check first and last name separately
        const firstSim = this.calculateSimilarity(runner1.name.first, runner2.name.first);
        const lastSim = this.calculateSimilarity(runner1.name.last, runner2.name.last);
        
        if (firstSim >= 90 && lastSim >= 90) {
          group.push(runner2);
          processed.add(id2);
          reasons.push('Very similar first and last names');
          continue;
        }
        
        // Check phonetic similarity
        if (this.arePhoneticallySimilar(name1, name2)) {
          // Additional check: same birth year or club
          if (runner1.birthYear === runner2.birthYear || 
              (runner1.club && runner2.club && runner1.club === runner2.club)) {
            group.push(runner2);
            processed.add(id2);
            reasons.push('Phonetically similar with matching details');
          }
        }
      }
      
      // Only add groups with more than one runner
      if (group.length > 1) {
        const avgSimilarity = this.calculateGroupSimilarity(group);
        duplicateGroups.push({
          id: `dup_${duplicateGroups.length + 1}`,
          runners: group,
          similarity: avgSimilarity,
          reason: reasons[0] || 'Similar names detected'
        });
        processed.add(id1);
      }
    }
    
    // Sort by similarity (highest first)
    duplicateGroups.sort((a, b) => b.similarity - a.similarity);
    
    console.log(`[DuplicateDetection] Found ${duplicateGroups.length} potential duplicate groups`);
    
    return duplicateGroups;
  }

  /**
   * Calculate average similarity within a group
   */
  private calculateGroupSimilarity(group: any[]): number {
    if (group.length < 2) return 100;
    
    let totalSim = 0;
    let comparisons = 0;
    
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const name1 = this.normalizeName(group[i].name.first, group[i].name.last);
        const name2 = this.normalizeName(group[j].name.first, group[j].name.last);
        totalSim += this.calculateSimilarity(name1, name2);
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalSim / comparisons : 100;
  }

  /**
   * Get duplicate statistics
   */
  getDuplicateStats(runners: any[], duplicateGroups: DuplicateGroup[]): DuplicateStats {
    const totalDuplicateRunners = duplicateGroups.reduce((sum, group) => sum + group.runners.length, 0);
    
    const highConfidence = duplicateGroups.filter(g => g.similarity >= 95).length;
    const mediumConfidence = duplicateGroups.filter(g => g.similarity >= 85 && g.similarity < 95).length;
    const lowConfidence = duplicateGroups.filter(g => g.similarity < 85).length;
    
    return {
      totalRunners: runners.length,
      potentialDuplicates: totalDuplicateRunners,
      duplicateGroups: duplicateGroups.length,
      highConfidence,
      mediumConfidence,
      lowConfidence
    };
  }

  /**
   * Find runners with missing or incomplete data
   */
  findIncompleteRunners(runners: any[]): any[] {
    return runners.filter(runner => {
      const missingData = [];
      
      if (!runner.birthYear || runner.birthYear === 0) missingData.push('birth year');
      if (!runner.sex) missingData.push('gender');
      if (!runner.club || runner.club === 'Unknown' || runner.club === '') missingData.push('club');
      
      return missingData.length > 0;
    });
  }

  /**
   * Group runners by club
   */
  groupByClub(runners: any[]): Map<string, any[]> {
    const clubGroups = new Map<string, any[]>();
    
    runners.forEach(runner => {
      const club = runner.club || 'Unknown';
      
      if (!clubGroups.has(club)) {
        clubGroups.set(club, []);
      }
      
      clubGroups.get(club)!.push(runner);
    });
    
    return clubGroups;
  }

  /**
   * Get club statistics
   */
  getClubStats(runners: any[]): Array<{club: string; count: number; percentage: number}> {
    const clubGroups = this.groupByClub(runners);
    const total = runners.length;
    
    const stats = Array.from(clubGroups.entries()).map(([club, members]) => ({
      club,
      count: members.length,
      percentage: (members.length / total) * 100
    }));
    
    // Sort by count descending
    stats.sort((a, b) => b.count - a.count);
    
    return stats;
  }

  /**
   * Find suspicious entries (potential data quality issues)
   */
  findSuspiciousEntries(runners: any[]): Array<{runner: any; issues: string[]}> {
    const suspicious: Array<{runner: any; issues: string[]}> = [];
    
    runners.forEach(runner => {
      const issues: string[] = [];
      
      // Check for very old birth years
      if (runner.birthYear && runner.birthYear < 1920) {
        issues.push(`Birth year ${runner.birthYear} seems too old`);
      }
      
      // Check for future birth years
      const currentYear = new Date().getFullYear();
      if (runner.birthYear && runner.birthYear > currentYear) {
        issues.push(`Birth year ${runner.birthYear} is in the future`);
      }
      
      // Check for single-character names
      if (runner.name.first.length === 1 || runner.name.last.length === 1) {
        issues.push('Name has only one character');
      }
      
      // Check for all-caps or all-lowercase names
      if (runner.name.first === runner.name.first.toUpperCase() && runner.name.first.length > 2) {
        issues.push('First name is all caps');
      }
      
      if (runner.name.last === runner.name.last.toUpperCase() && runner.name.last.length > 2) {
        issues.push('Last name is all caps');
      }
      
      // Check for numeric characters in names
      if (/\d/.test(runner.name.first) || /\d/.test(runner.name.last)) {
        issues.push('Name contains numbers');
      }
      
      if (issues.length > 0) {
        suspicious.push({ runner, issues });
      }
    });
    
    return suspicious;
  }
}

// Export singleton instance
export const duplicateDetectionService = new DuplicateDetectionService();
export default DuplicateDetectionService;
