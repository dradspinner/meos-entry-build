// IOF-XML Runner Database Service
// Manages runner database using IOF-XML format, stored in browser memory and localStorage

import { iofXmlParserService, IOFRunner, IOFParseResult } from './iofXmlParserService';

interface RunnerDatabaseStats {
  totalRunners: number;
  lastUpdated?: Date;
  sourceFile?: string;
  creator?: string;
}

class IOFRunnerDatabaseService {
  private runners: IOFRunner[] = [];
  private stats: RunnerDatabaseStats = { totalRunners: 0 };
  private readonly STORAGE_KEY = 'meos_iof_runners';
  private readonly STATS_KEY = 'meos_iof_runners_stats';
  private readonly XML_CONTENT_KEY = 'meos_iof_xml_content';
  
  /**
   * Initialize the service - load existing data from localStorage
   */
  async initialize(): Promise<void> {
    console.log('[IOF-RunnerDB] Initializing IOF-XML runner database service...');
    
    try {
      await this.loadFromStorage();
      console.log(`[IOF-RunnerDB] Initialized with ${this.runners.length} runners`);
    } catch (error) {
      console.error('[IOF-RunnerDB] Failed to initialize:', error);
      this.runners = [];
      this.stats = { totalRunners: 0 };
    }
  }
  
  /**
   * Load runners and stats from localStorage
   */
  private async loadFromStorage(): Promise<void> {
    try {
      // Load runners
      const storedRunners = localStorage.getItem(this.STORAGE_KEY);
      if (storedRunners) {
        const parsedRunners = JSON.parse(storedRunners);
        this.runners = parsedRunners.map((runner: any) => ({
          ...runner,
          // Ensure proper typing
        }));
      }
      
      // Load stats
      const storedStats = localStorage.getItem(this.STATS_KEY);
      if (storedStats) {
        const parsedStats = JSON.parse(storedStats);
        this.stats = {
          ...parsedStats,
          lastUpdated: parsedStats.lastUpdated ? new Date(parsedStats.lastUpdated) : undefined
        };
      }
      
      // Update stats if runners exist but stats don't match
      if (this.runners.length > 0 && this.stats.totalRunners !== this.runners.length) {
        this.stats.totalRunners = this.runners.length;
        this.saveStats();
      }
      
    } catch (error) {
      console.warn('[IOF-RunnerDB] Failed to load from storage:', error);
    }
  }
  
  /**
   * Save runners to localStorage
   */
  private saveRunners(): void {
    try {
      const runnersJson = JSON.stringify(this.runners, null, 2);
      localStorage.setItem(this.STORAGE_KEY, runnersJson);
      console.log(`[IOF-RunnerDB] Saved ${this.runners.length} runners to localStorage`);
    } catch (error) {
      console.error('[IOF-RunnerDB] Failed to save runners:', error);
    }
  }
  
  /**
   * Save stats to localStorage
   */
  private saveStats(): void {
    try {
      localStorage.setItem(this.STATS_KEY, JSON.stringify(this.stats));
    } catch (error) {
      console.error('[IOF-RunnerDB] Failed to save stats:', error);
    }
  }
  
  /**
   * Save XML content to localStorage for backup
   */
  private saveXmlContent(content: string, filename: string): void {
    try {
      const xmlData = {
        content,
        filename,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(this.XML_CONTENT_KEY, JSON.stringify(xmlData));
    } catch (error) {
      console.warn('[IOF-RunnerDB] Failed to save XML content:', error);
    }
  }
  
  /**
   * Load runners from IOF-XML file
   */
  async loadFromIOFXML(file: File): Promise<{ success: boolean; message: string; stats: RunnerDatabaseStats }> {
    console.log(`[IOF-RunnerDB] Loading runners from IOF-XML file: ${file.name}`);
    
    try {
      const parseResult = await iofXmlParserService.parseFromFile(file);
      
      // Update in-memory data
      this.runners = parseResult.runners;
      this.stats = {
        totalRunners: parseResult.totalCount,
        lastUpdated: new Date(),
        sourceFile: file.name,
        creator: parseResult.creator
      };
      
      // Save to localStorage
      this.saveRunners();
      this.saveStats();
      
      // Save XML content for backup
      const fileContent = await this.readFileAsText(file);
      this.saveXmlContent(fileContent, file.name);
      
      console.log(`[IOF-RunnerDB] Successfully loaded ${this.stats.totalRunners} runners from ${file.name}`);
      
      return {
        success: true,
        message: `Successfully loaded ${this.stats.totalRunners} runners from ${file.name}`,
        stats: this.stats
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[IOF-RunnerDB] Failed to load from IOF-XML:', errorMessage);
      
      return {
        success: false,
        message: `Failed to load runners: ${errorMessage}`,
        stats: this.stats
      };
    }
  }
  
  /**
   * Helper to read file as text
   */
  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, 'utf-8');
    });
  }
  
  /**
   * Search runners by name
   */
  searchRunners(query: string, limit: number = 50): IOFRunner[] {
    if (!query || query.trim().length < 2) {
      return [];
    }
    
    const searchTerm = query.toLowerCase().trim();
    const results: IOFRunner[] = [];
    
    for (const runner of this.runners) {
      if (results.length >= limit) break;
      
      const firstName = runner.name.first.toLowerCase();
      const lastName = runner.name.last.toLowerCase();
      const fullName = `${firstName} ${lastName}`;
      const club = runner.club.toLowerCase();
      
      // Check if search term matches any field
      if (firstName.includes(searchTerm) || 
          lastName.includes(searchTerm) || 
          fullName.includes(searchTerm) ||
          club.includes(searchTerm)) {
        results.push(runner);
      }
    }
    
    // Sort results by relevance (exact matches first, then partial matches)
    results.sort((a, b) => {
      const aFullName = `${a.name.first} ${a.name.last}`.toLowerCase();
      const bFullName = `${b.name.first} ${b.name.last}`.toLowerCase();
      
      // Exact matches first
      if (aFullName === searchTerm && bFullName !== searchTerm) return -1;
      if (bFullName === searchTerm && aFullName !== searchTerm) return 1;
      
      // Then by first name matches
      if (a.name.first.toLowerCase().startsWith(searchTerm) && !b.name.first.toLowerCase().startsWith(searchTerm)) return -1;
      if (b.name.first.toLowerCase().startsWith(searchTerm) && !a.name.first.toLowerCase().startsWith(searchTerm)) return 1;
      
      // Then alphabetically
      return aFullName.localeCompare(bFullName);
    });
    
    console.log(`[IOF-RunnerDB] Search for "${query}" returned ${results.length} results`);
    return results;
  }
  
  /**
   * Get all runners
   */
  getAllRunners(): IOFRunner[] {
    return [...this.runners]; // Return a copy
  }
  
  /**
   * Get database statistics
   */
  getStats(): RunnerDatabaseStats {
    return { ...this.stats };
  }
  
  /**
   * Check if database is available (has runners)
   */
  isAvailable(): boolean {
    return this.runners.length > 0;
  }
  
  /**
   * Get runner by ID
   */
  getRunnerById(id: string): IOFRunner | undefined {
    return this.runners.find(runner => runner.id === id);
  }
  
  /**
   * Find runners by exact name match
   */
  findByExactName(firstName: string, lastName: string): IOFRunner[] {
    const first = firstName.toLowerCase().trim();
    const last = lastName.toLowerCase().trim();
    
    return this.runners.filter(runner => 
      runner.name.first.toLowerCase() === first && 
      runner.name.last.toLowerCase() === last
    );
  }
  
  /**
   * Get runners by club
   */
  getRunnersByClub(clubName: string): IOFRunner[] {
    const club = clubName.toLowerCase().trim();
    return this.runners.filter(runner => 
      runner.club.toLowerCase() === club
    );
  }
  
  /**
   * Clear all runner data
   */
  clearAll(): void {
    this.runners = [];
    this.stats = { totalRunners: 0 };
    
    localStorage.removeItem(this.STORAGE_KEY);
    localStorage.removeItem(this.STATS_KEY);
    localStorage.removeItem(this.XML_CONTENT_KEY);
    
    console.log('[IOF-RunnerDB] Cleared all runner data');
  }
  
  /**
   * Export current data as IOF-XML format (for backup)
   */
  exportAsIOFXML(): string {
    const now = new Date();
    const timestamp = now.toISOString();
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n\n`;
    xml += `<CompetitorList xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" iofVersion="3.0" createTime="${timestamp}" creator="MeOS Entry Build App">\n`;
    
    for (const runner of this.runners) {
      xml += `<Competitor>\n`;
      xml += `<Person${runner.sex ? ` sex="${runner.sex}"` : ''}>\n`;
      xml += `<Name>\n`;
      xml += `<Given>${this.escapeXml(runner.name.first)}</Given>\n`;
      xml += `<Family>${this.escapeXml(runner.name.last)}</Family>\n`;
      xml += `</Name>\n`;
      if (runner.birthYear) {
        xml += `<BirthDate>${runner.birthYear}-01-01</BirthDate>\n`;
      }
      xml += `</Person>\n`;
      if (runner.cardNumber) {
        xml += `<ControlCard punchingSystem="SI">${runner.cardNumber}</ControlCard>\n`;
      }
      if (runner.club && runner.club !== 'Unknown') {
        xml += `<Organisation>\n`;
        if (runner.clubNo) {
          xml += `<Id>${runner.clubNo}</Id>\n`;
        }
        xml += `<Name>${this.escapeXml(runner.club)}</Name>\n`;
        xml += `</Organisation>\n`;
      }
      xml += `</Competitor>\n`;
    }
    
    xml += `</CompetitorList>`;
    
    return xml;
  }
  
  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  /**
   * Get saved XML content (for re-processing or backup)
   */
  getSavedXmlContent(): { content: string; filename: string; savedAt: Date } | null {
    try {
      const stored = localStorage.getItem(this.XML_CONTENT_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        return {
          ...data,
          savedAt: new Date(data.savedAt)
        };
      }
    } catch (error) {
      console.warn('[IOF-RunnerDB] Failed to get saved XML content:', error);
    }
    return null;
  }
}

// Create and export singleton instance
export const iofRunnerDatabaseService = new IOFRunnerDatabaseService();
export default IOFRunnerDatabaseService;