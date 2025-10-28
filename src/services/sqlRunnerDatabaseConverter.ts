// SQL Runner Database to IOF XML Converter Service
// Converts DVOA SQL runner database exports to IOF XML 3.0 format

export interface SQLRunnerRecord {
  id: string;
  mmbr_id: string;
  fname: string;
  lname: string;
  name: string;
  sex: 'M' | 'F' | '';
  yob: string;
  club_id: string;
  club_name: string;
  rank_count: string;
  rank_score_start: string;
  rank_score_end: string;
  rank_score_top: string;
  created_date: string;
  last_ev_date: string;
}

export interface ConversionResult {
  success: boolean;
  message: string;
  iofXml?: string;
  totalRunners?: number;
  errors?: string[];
}

class SQLRunnerDatabaseConverter {
  
  /**
   * Convert SQL runner database XML to IOF XML 3.0 format
   */
  async convertToIOFXml(file: File): Promise<ConversionResult> {
    console.log('[SQL-Converter] Starting conversion of SQL runner database...');
    
    try {
      const content = await this.readFileAsText(file);
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(content, 'text/xml');
      
      // Check for XML parsing errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error(`XML parsing error: ${parseError.textContent}`);
      }
      
      // Get all DATA_RECORD elements
      const dataRecords = xmlDoc.querySelectorAll('DATA_RECORD');
      console.log(`[SQL-Converter] Found ${dataRecords.length} runner records to convert`);
      
      if (dataRecords.length === 0) {
        throw new Error('No DATA_RECORD elements found in XML file');
      }
      
      const errors: string[] = [];
      const runners: SQLRunnerRecord[] = [];
      
      // Parse each DATA_RECORD
      dataRecords.forEach((record, index) => {
        try {
          const runner = this.parseDataRecord(record);
          if (runner) {
            runners.push(runner);
          }
        } catch (error) {
          const errorMsg = `Record ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.warn(`[SQL-Converter] ${errorMsg}`);
        }
      });
      
      if (runners.length === 0) {
        throw new Error('No valid runner records could be parsed from the file');
      }
      
      // Generate IOF XML 3.0
      const iofXml = this.generateIOFXml(runners);
      
      console.log(`[SQL-Converter] Successfully converted ${runners.length} runners`);
      if (errors.length > 0) {
        console.warn(`[SQL-Converter] ${errors.length} records had errors during conversion`);
      }
      
      return {
        success: true,
        message: `Successfully converted ${runners.length} runners to IOF XML format`,
        iofXml,
        totalRunners: runners.length,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SQL-Converter] Conversion failed:', errorMessage);
      
      return {
        success: false,
        message: `Conversion failed: ${errorMessage}`
      };
    }
  }
  
  /**
   * Parse a single DATA_RECORD element
   */
  private parseDataRecord(record: Element): SQLRunnerRecord | null {
    const getTextContent = (tagName: string): string => {
      return record.querySelector(tagName)?.textContent?.trim() || '';
    };
    
    const fname = getTextContent('fname');
    const lname = getTextContent('lname');
    
    // Skip records without names
    if (!fname && !lname) {
      return null;
    }
    
    // Clean year of birth (remove commas: "1,954" -> "1954")
    const yob = getTextContent('yob').replace(/,/g, '');
    
    const sex = getTextContent('sex');
    const validSex = sex === 'M' || sex === 'F' ? sex : '';
    
    return {
      id: getTextContent('id'),
      mmbr_id: getTextContent('mmbr_id'),
      fname,
      lname,
      name: getTextContent('name'),
      sex: validSex as 'M' | 'F' | '',
      yob,
      club_id: getTextContent('club_id'),
      club_name: getTextContent('club_name'),
      rank_count: getTextContent('rank_count'),
      rank_score_start: getTextContent('rank_score_start'),
      rank_score_end: getTextContent('rank_score_end'),
      rank_score_top: getTextContent('rank_score_top'),
      created_date: getTextContent('created_date'),
      last_ev_date: getTextContent('last_ev_date')
    };
  }
  
  /**
   * Generate IOF XML 3.0 format from SQL runner records
   */
  private generateIOFXml(runners: SQLRunnerRecord[]): string {
    const now = new Date();
    const timestamp = now.toISOString();
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n\n`;
    xml += `<CompetitorList xmlns="http://www.orienteering.org/datastandard/3.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" iofVersion="3.0" createTime="${timestamp}" creator="MeOS Entry Build - SQL Runner Database Converter">\n`;
    
    for (const runner of runners) {
      xml += this.generateCompetitorElement(runner);
    }
    
    xml += `</CompetitorList>`;
    
    return xml;
  }
  
  /**
   * Generate a single Competitor element
   */
  private generateCompetitorElement(runner: SQLRunnerRecord): string {
    let xml = `  <Competitor>\n`;
    
    // Person element with sex attribute
    xml += `    <Person${runner.sex ? ` sex="${runner.sex}"` : ''}>\n`;
    xml += `      <Name>\n`;
    xml += `        <Given>${this.escapeXml(runner.fname)}</Given>\n`;
    xml += `        <Family>${this.escapeXml(runner.lname)}</Family>\n`;
    xml += `      </Name>\n`;
    
    // Add birth year if available
    if (runner.yob && runner.yob !== '0') {
      xml += `      <BirthDate>${runner.yob}-01-01</BirthDate>\n`;
    }
    
    xml += `    </Person>\n`;
    
    // Organization element if club exists
    if (runner.club_name && runner.club_name !== '') {
      xml += `    <Organisation>\n`;
      
      // Add club ID if available and not 0
      if (runner.club_id && runner.club_id !== '0') {
        xml += `      <Id>${this.escapeXml(runner.club_id)}</Id>\n`;
      }
      
      xml += `      <Name>${this.escapeXml(runner.club_name)}</Name>\n`;
      xml += `    </Organisation>\n`;
    }
    
    xml += `  </Competitor>\n`;
    
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
   * Read file as text
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
   * Download generated IOF XML as file
   */
  downloadIOFXml(iofXml: string, originalFilename: string): void {
    const blob = new Blob([iofXml], { type: 'text/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // Generate output filename
    const baseName = originalFilename.replace(/\.(xml|sql)$/i, '');
    const outputFilename = `${baseName}_iof_converted.xml`;
    
    link.href = url;
    link.download = outputFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log(`[SQL-Converter] Downloaded IOF XML as: ${outputFilename}`);
  }
}

// Create and export singleton instance
export const sqlRunnerDatabaseConverter = new SQLRunnerDatabaseConverter();
export default SQLRunnerDatabaseConverter;
