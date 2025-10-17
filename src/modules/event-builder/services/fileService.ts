// File Service for loading test data and files
import { MeOSXMLParser, type MeOSData } from './meosXmlParser';

export class FileService {
  /**
   * Load Brandywine test data
   * In a real application, this would load from a proper file path
   * For now, we'll embed the data or use a mock service
   */
  static async loadBrandywineTestData(): Promise<MeOSData> {
    // In production, this would use Electron's file system API
    // For now, we'll return a manually constructed version based on the XML
    
    const brandywineData: MeOSData = {
      event: {
        name: "Brandywine Test",
        date: "2025-04-27",
        organizer: "Brandywine organizer",
        courseSetter: "Brandywine course setter",
        homepage: "https://www.dvoa.org/dvoa-event-schedule/",
        cardFee: 10,
        youthAge: 16,
        lateEntryFactor: "50 %",
        features: "CL+CC+RF+RD",
        payModes: "Cash|0"
      },
      courses: [
        {
          id: 1,
          name: "Blue",
          length: 5225,
          controls: [78, 76, 77, 65, 54, 50, 71, 53, 70, 62, 40, 39],
          startName: "Start"
        },
        {
          id: 2,
          name: "Brown",
          length: 3975,
          controls: [42, 78, 76, 77, 74, 51, 65, 54, 50, 71, 53, 70, 62, 40, 39],
          startName: "Start"
        },
        {
          id: 3,
          name: "Green",
          length: 6200,
          controls: [51, 65, 54, 50, 71, 53, 55, 56, 57, 58, 59, 60, 61, 70, 62, 39],
          startName: "Start"
        },
        {
          id: 4,
          name: "Orange",
          length: 4075,
          controls: [42, 64, 47, 78, 76, 73, 77, 51, 70, 34, 39],
          startName: "Start"
        },
        {
          id: 5,
          name: "Red",
          length: 7325,
          controls: [78, 76, 77, 65, 54, 51, 50, 55, 61, 82, 60, 59, 58, 57, 56, 53, 70, 62, 40, 39],
          startName: "Start"
        },
        {
          id: 6,
          name: "White",
          length: 2225,
          controls: [36, 35, 34, 33, 32, 31, 37, 38, 39],
          startName: "Start",
          climb: 40
        },
        {
          id: 7,
          name: "Yellow",
          length: 2700,
          controls: [41, 42, 47, 43, 44, 45, 46, 40, 48, 49, 38, 39],
          startName: "Start",
          climb: 50
        }
      ],
      classes: [
        { id: 1, name: "Blue", courseId: 1, allowQuickEntry: true, sortIndex: 10 },
        { id: 2, name: "Brown", courseId: 2, allowQuickEntry: true, sortIndex: 20 },
        { id: 3, name: "Green", courseId: 3, allowQuickEntry: true, sortIndex: 30 },
        { id: 4, name: "Orange", courseId: 4, allowQuickEntry: true, sortIndex: 40 },
        { id: 5, name: "Red", courseId: 5, allowQuickEntry: true, sortIndex: 50 },
        { id: 6, name: "White", courseId: 6, allowQuickEntry: true, sortIndex: 60 },
        { id: 7, name: "Yellow", courseId: 7, allowQuickEntry: true, sortIndex: 70 }
      ],
      controls: [
        { id: 31, numbers: "31" },
        { id: 32, numbers: "32" },
        { id: 33, numbers: "33" },
        { id: 34, numbers: "34" },
        { id: 35, numbers: "35" },
        { id: 36, numbers: "36" },
        { id: 37, numbers: "37" },
        { id: 38, numbers: "38" },
        { id: 39, numbers: "39" },
        { id: 40, numbers: "40" },
        { id: 41, numbers: "41" },
        { id: 42, numbers: "42" },
        { id: 43, numbers: "43" },
        { id: 44, numbers: "44" },
        { id: 45, numbers: "45" },
        { id: 46, numbers: "46" },
        { id: 47, numbers: "47" },
        { id: 48, numbers: "48" },
        { id: 49, numbers: "49" },
        { id: 50, numbers: "50" },
        { id: 51, numbers: "51" },
        { id: 53, numbers: "53" },
        { id: 54, numbers: "54" },
        { id: 55, numbers: "55" },
        { id: 56, numbers: "56" },
        { id: 57, numbers: "57" },
        { id: 58, numbers: "58" },
        { id: 59, numbers: "59" },
        { id: 60, numbers: "60" },
        { id: 61, numbers: "61" },
        { id: 62, numbers: "62" },
        { id: 64, numbers: "64" },
        { id: 65, numbers: "65" },
        { id: 70, numbers: "70" },
        { id: 71, numbers: "71" },
        { id: 73, numbers: "73" },
        { id: 74, numbers: "74" },
        { id: 76, numbers: "76" },
        { id: 77, numbers: "77" },
        { id: 78, numbers: "78" },
        { id: 82, numbers: "82" }
      ],
      clubs: [
        { id: 852, name: "DVOA", shortName: "DVOA", nationality: "USA", country: "United States", type: "Club" },
        { id: 14, name: "none", shortName: "none" },
        { id: 3, name: "QOC", shortName: "QOC" },
        { id: 854, name: "Scouts BSA Troop 1523G" },
        { id: 853, name: "Test Club" }
      ],
      competitors: []
    };

    return brandywineData;
  }

  /**
   * Simulate file upload processing
   */
  static async processFileUpload(file: File): Promise<MeOSData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const xmlContent = e.target?.result as string;
          const parsedData = MeOSXMLParser.parseMeOSXML(xmlContent);
          resolve(parsedData);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Generate download link for MeOS XML
   */
  static downloadMeOSXML(data: MeOSData, filename: string = 'event.meosxml'): void {
    const xmlContent = MeOSXMLParser.generateMeOSXML(data);
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.meosxml') ? filename : `${filename}.meosxml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Export course statistics as CSV
   */
  static downloadCourseStats(data: MeOSData, filename: string = 'course_stats.csv'): void {
    const stats = MeOSXMLParser.getCourseStats(data);
    
    let csv = 'Course,Length(m),Climb(m),Controls,Classes,Class Names\n';
    
    Object.entries(stats).forEach(([courseName, courseStats]) => {
      csv += `${courseName},${courseStats.length},${courseStats.climb},${courseStats.controls},${courseStats.classCount},"${courseStats.classes.join('; ')}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}