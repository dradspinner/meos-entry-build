// MeOS Class Mapping Service
// Provides consistent class ID mapping across the application

import { meosApi } from './meosApi';

export interface MeosClass {
  id: number;
  name: string;
  shortName?: string;
  fee?: number;
  allowQuickEntry?: boolean;
  remainingMaps?: number;
}

class MeosClassService {
  private classes: MeosClass[] = [];
  private lastFetch: number = 0;
  private readonly CACHE_DURATION = 300000; // 5 minutes

  /**
   * Get all available MeOS classes, fetching from API if needed
   */
  async getClasses(forceRefresh = false): Promise<MeosClass[]> {
    const now = Date.now();
    const needsRefresh = forceRefresh || 
                        this.classes.length === 0 || 
                        (now - this.lastFetch) > this.CACHE_DURATION;

    if (needsRefresh) {
      try {
        console.log('[MeosClassService] Fetching classes from MeOS API...');
        this.classes = await meosApi.getClasses();
        this.lastFetch = now;
        console.log(`[MeosClassService] Loaded ${this.classes.length} classes:`, 
                   this.classes.map(c => `${c.name}(${c.id})`));
      } catch (error) {
        console.error('[MeosClassService] Failed to fetch classes:', error);
        // Keep existing classes if fetch fails
      }
    }

    return this.classes;
  }

  /**
   * Convert class name or ID to MeOS class ID
   */
  async getClassId(className: string, classId: string): Promise<{ id: number, method: string }> {
    const classes = await this.getClasses();
    let meosClassId: number = 0;
    let conversionMethod = '';

    // Try to find class by name in MeOS classes first
    if (classes.length > 0) {
      // Try exact match by name first
      const classByName = classes.find(c => 
        c.name?.toLowerCase() === className?.toLowerCase() ||
        c.shortName?.toLowerCase() === className?.toLowerCase()
      );
      
      if (classByName) {
        meosClassId = classByName.id;
        conversionMethod = `by MeOS class name match (${classByName.name})`;
      } else {
        // Try to find by classId if it's a name
        const classByIdName = classes.find(c => 
          c.name?.toLowerCase() === classId?.toLowerCase() ||
          c.shortName?.toLowerCase() === classId?.toLowerCase()
        );
        
        if (classByIdName) {
          meosClassId = classByIdName.id;
          conversionMethod = `by MeOS classId name match (${classByIdName.name})`;
        } else if (parseInt(classId)) {
          // Try numeric classId if it matches a MeOS class ID
          const numericId = parseInt(classId);
          const classByNumericId = classes.find(c => c.id === numericId);
          if (classByNumericId) {
            meosClassId = numericId;
            conversionMethod = `by numeric MeOS class ID (${classByNumericId.name})`;
          }
        }
      }
    }
    
    // Fallback to hardcoded mapping if MeOS classes not loaded or no match found
    if (!meosClassId) {
      const courseToClassId: Record<string, number> = {
        'Blue': 1, 'Brown': 2, 'Green': 3, 'Orange': 4, 'Red': 5, 'White': 6, 'Yellow': 7,
      };
      
      meosClassId = courseToClassId[className] || parseInt(classId) || courseToClassId[classId] || 1;
      
      if (courseToClassId[className]) {
        conversionMethod = `by fallback className mapping`;
      } else if (parseInt(classId)) {
        conversionMethod = `by fallback numeric classId`;
      } else if (courseToClassId[classId]) {
        conversionMethod = `by fallback classId name mapping`;
      } else {
        conversionMethod = `fallback default to 1`;
      }
    }

    return { id: meosClassId, method: conversionMethod };
  }

  /**
   * Get cached classes without API call
   */
  getCachedClasses(): MeosClass[] {
    return this.classes;
  }

  /**
   * Clear cached classes
   */
  clearCache(): void {
    this.classes = [];
    this.lastFetch = 0;
  }

  /**
   * Check if classes are loaded and fresh
   */
  hasValidClasses(): boolean {
    const now = Date.now();
    return this.classes.length > 0 && (now - this.lastFetch) < this.CACHE_DURATION;
  }
}

export const meosClassService = new MeosClassService();
export default MeosClassService;