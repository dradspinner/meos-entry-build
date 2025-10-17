// IOF-XML Parser Service for MeOS Runner Database
// Parses IOF 3.0 XML files exported from MeOS containing competitor/person data

export interface IOFRunner {
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

export interface IOFParseResult {
  runners: IOFRunner[];
  totalCount: number;
  exportDate?: Date;
  creator?: string;
  organizationMap?: Map<string, string>;
}

class IOFXmlParserService {
  
  /**
   * Parse IOF-XML content from a file or string
   */
  async parseIOFXml(content: string): Promise<IOFParseResult> {
    console.log('[IOF-XML] Starting parse of IOF-XML content...');
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      
      // Check for XML parsing errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error(`XML parsing error: ${parseError.textContent}`);
      }
      
      // Extract metadata from root element
      const root = xmlDoc.documentElement;
      const createTime = root.getAttribute('createTime');
      const creator = root.getAttribute('creator');
      
      console.log(`[IOF-XML] Document info - Creator: ${creator}, Created: ${createTime}`);
      
      // Build organization map first (ID -> Name)
      const organizationMap = this.buildOrganizationMap(xmlDoc);
      
      // Parse all competitors
      const competitors = xmlDoc.querySelectorAll('Competitor');
      const runners: IOFRunner[] = [];
      
      console.log(`[IOF-XML] Found ${competitors.length} competitors to parse`);
      
      competitors.forEach((competitor, index) => {
        try {
          const runner = this.parseCompetitor(competitor, organizationMap, index);
          if (runner) {
            runners.push(runner);
          }
        } catch (error) {
          console.warn(`[IOF-XML] Failed to parse competitor ${index + 1}:`, error);
        }
      });
      
      console.log(`[IOF-XML] Successfully parsed ${runners.length} runners`);
      
      return {
        runners,
        totalCount: runners.length,
        exportDate: createTime ? new Date(createTime) : undefined,
        creator: creator || undefined,
        organizationMap
      };
      
    } catch (error) {
      console.error('[IOF-XML] Parse failed:', error);
      throw new Error(`Failed to parse IOF-XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Parse a single competitor element
   */
  private parseCompetitor(competitor: Element, organizationMap: Map<string, string>, index: number): IOFRunner | null {
    const person = competitor.querySelector('Person');
    if (!person) {
      console.warn(`[IOF-XML] Competitor ${index + 1} has no Person element`);
      return null;
    }
    
    // Extract name
    const nameElem = person.querySelector('Name');
    const firstName = nameElem?.querySelector('Given')?.textContent?.trim() || '';
    const lastName = nameElem?.querySelector('Family')?.textContent?.trim() || '';
    
    if (!firstName && !lastName) {
      console.warn(`[IOF-XML] Competitor ${index + 1} has no name`);
      return null;
    }
    
    // Extract other person details
    const sex = person.getAttribute('sex') as 'M' | 'F' | null;
    const birthDateStr = person.querySelector('BirthDate')?.textContent?.trim();
    let birthYear: number | undefined;
    
    if (birthDateStr) {
      const birthDate = new Date(birthDateStr);
      if (!isNaN(birthDate.getTime())) {
        birthYear = birthDate.getFullYear();
      }
    }
    
    // Extract control card
    const controlCard = competitor.querySelector('ControlCard');
    let cardNumber: number | undefined;
    if (controlCard?.textContent) {
      const cardNum = parseInt(controlCard.textContent.trim());
      if (!isNaN(cardNum)) {
        cardNumber = cardNum;
      }
    }
    
    // Extract organization
    const orgElement = competitor.querySelector('Organisation');
    let club = '';
    let clubNo: number | undefined;
    
    if (orgElement) {
      // Try to get organization name directly
      const orgName = orgElement.querySelector('Name')?.textContent?.trim();
      if (orgName) {
        club = orgName;
      } else {
        // Try to get from ID and map
        const orgId = orgElement.querySelector('Id')?.textContent?.trim();
        if (orgId) {
          club = organizationMap.get(orgId) || `Club ${orgId}`;
          const clubNoNum = parseInt(orgId);
          if (!isNaN(clubNoNum)) {
            clubNo = clubNoNum;
          }
        }
      }
    }
    
    // Generate unique ID
    const runnerId = `iof_${index + 1}_${firstName.toLowerCase()}_${lastName.toLowerCase()}`.replace(/[^a-z0-9_]/g, '');
    
    const runner: IOFRunner = {
      id: runnerId,
      name: {
        first: firstName,
        last: lastName
      },
      club: club || 'Unknown',
      clubNo,
      birthYear,
      sex: sex || undefined,
      cardNumber,
      nationality: '', // IOF-XML doesn't seem to have nationality in this format
      extId: `${index + 1}` // Use competitor index as external ID
    };
    
    return runner;
  }
  
  /**
   * Build a map of organization IDs to names
   */
  private buildOrganizationMap(xmlDoc: Document): Map<string, string> {
    const organizationMap = new Map<string, string>();
    
    // Look for organization definitions (might be at different levels)
    const organizations = xmlDoc.querySelectorAll('Organisation');
    
    organizations.forEach(org => {
      const id = org.querySelector('Id')?.textContent?.trim();
      const name = org.querySelector('Name')?.textContent?.trim();
      
      if (id && name) {
        organizationMap.set(id, name);
      }
    });
    
    // Add some common mappings if we don't have explicit definitions
    if (organizationMap.size === 0) {
      organizationMap.set('852', 'DVOA'); // Common in your data
      organizationMap.set('4', 'Other Club'); // Found in data
    }
    
    console.log(`[IOF-XML] Built organization map with ${organizationMap.size} entries:`, Array.from(organizationMap.entries()));
    
    return organizationMap;
  }
  
  /**
   * Read and parse IOF-XML file using File API
   */
  async parseFromFile(file: File): Promise<IOFParseResult> {
    console.log(`[IOF-XML] Reading file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (event) => {
        try {
          const content = event.target?.result as string;
          const result = await this.parseIOFXml(content);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file, 'utf-8');
    });
  }
  
  /**
   * Convert IOF runners to MeOS runner format for compatibility
   */
  convertToMeosRunners(iofRunners: IOFRunner[]): any[] {
    return iofRunners.map(runner => ({
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
  }
}

export const iofXmlParserService = new IOFXmlParserService();
export default IOFXmlParserService;