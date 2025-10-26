// MeOS Event File Reader Service
// Reads .meos XML files from AppData/Roaming/Meos

import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { meosApi } from './meosApi.js';
import { loadConfig } from './configService.js';

export interface MeosCourse {
  id: number;
  name: string;
  length: number;
  climb?: number;
  controls: string[];
}

export interface MeosClass {
  id: number;
  name: string;
  courseId?: number;
  course?: MeosCourse;
}

export interface MeosEventData {
  name: string;
  date: string;
  courses: MeosCourse[];
  classes: MeosClass[];
}

/**
 * Parse MeOS event XML file
 */
export function parseMeosEventFile(xmlContent: string): MeosEventData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

  // Parse event metadata
  const name = xmlDoc.getElementsByTagName('Name')[0]?.textContent || '';
  const date = xmlDoc.getElementsByTagName('Date')[0]?.textContent || '';

  // Parse courses
  const courses: MeosCourse[] = [];
  const courseElements = xmlDoc.getElementsByTagName('Course');

  for (let i = 0; i < courseElements.length; i++) {
    const courseEl = courseElements[i];
    
    const id = parseInt(courseEl.getElementsByTagName('Id')[0]?.textContent || '0');
    const courseName = courseEl.getElementsByTagName('Name')[0]?.textContent || '';
    const length = parseInt(courseEl.getElementsByTagName('Length')[0]?.textContent || '0');
    
    // Get controls list
    const controlsStr = courseEl.getElementsByTagName('Controls')[0]?.textContent || '';
    const controls = controlsStr.split(';').filter(c => c.trim() !== '');
    
    // Optional: get climb from oData
    let climb = 0;
    const oDataEl = courseEl.getElementsByTagName('oData')[0];
    if (oDataEl) {
      const climbEl = oDataEl.getElementsByTagName('Climb')[0];
      if (climbEl) {
        climb = parseInt(climbEl.textContent || '0');
      }
    }

    courses.push({
      id,
      name: courseName,
      length,
      climb,
      controls,
    });
  }

  console.log(`📋 [MeosFile] Parsed ${courses.length} courses:`, 
    courses.map(c => `${c.name} (${c.length}m, ${c.controls.length} controls)`)
  );

  // Parse classes
  const classes: MeosClass[] = [];
  const classElements = xmlDoc.getElementsByTagName('Class');

  for (let i = 0; i < classElements.length; i++) {
    const classEl = classElements[i];
    
    const id = parseInt(classEl.getElementsByTagName('Id')[0]?.textContent || '0');
    const className = classEl.getElementsByTagName('Name')[0]?.textContent || '';
    
    // Get linked course ID
    const courseEl = classEl.getElementsByTagName('Course')[0];
    const courseId = courseEl ? parseInt(courseEl.textContent || '0') : undefined;
    
    // Find matching course
    const course = courseId ? courses.find(c => c.id === courseId) : undefined;

    classes.push({
      id,
      name: className,
      courseId,
      course,
    });
  }

  console.log(`🎯 [MeosFile] Parsed ${classes.length} classes`);

  return {
    name,
    date,
    courses,
    classes,
  };
}

/**
 * Get the full path to the current MeOS event file
 * Uses configured MeOS data path + event name from API
 */
export async function getCurrentEventFilePath(): Promise<string | null> {
  try {
    // Get event name from API status
    const status = await meosApi.getStatus();
    
    if (!status || !status.eventNameId) {
      console.warn('⚠️ [MeosFile] No event currently open in MeOS');
      return null;
    }

    // Get configured MeOS data path
    const config = loadConfig();
    const meosDataPath = config.meosDataPath;

    // Build full file path
    const filePath = path.join(meosDataPath, `${status.eventNameId}.meos`);
    
    console.log(`📁 [MeosFile] Event file path: ${filePath}`);
    
    return filePath;
  } catch (error) {
    console.error('❌ [MeosFile] Failed to get event file path:', error);
    return null;
  }
}

/**
 * List all .meos files in the configured data directory
 */
export function listMeosFiles(): string[] {
  try {
    const config = loadConfig();
    const meosDataPath = config.meosDataPath;

    if (!existsSync(meosDataPath)) {
      console.warn(`⚠️ [MeosFile] MeOS data path not found: ${meosDataPath}`);
      return [];
    }

    const files = readdirSync(meosDataPath)
      .filter(file => file.endsWith('.meos'))
      .map(file => path.join(meosDataPath, file));

    console.log(`📂 [MeosFile] Found ${files.length} .meos files`);
    return files;
  } catch (error) {
    console.error('❌ [MeosFile] Failed to list .meos files:', error);
    return [];
  }
}

/**
 * Read and parse the current MeOS event file
 */
export async function readCurrentMeosEvent(): Promise<MeosEventData | null> {
  try {
    console.log('📂 [MeosFile] Getting current event file path...');
    
    // Get file path using config + API
    const filePath = await getCurrentEventFilePath();
    
    if (!filePath) {
      console.warn('⚠️ [MeosFile] No event file path available');
      return null;
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      console.error(`❌ [MeosFile] File not found: ${filePath}`);
      return null;
    }

    console.log(`📖 [MeosFile] Reading event file: ${filePath}`);

    // Read file
    const xmlContent = readFileSync(filePath, 'utf-8');
    
    console.log(`✅ [MeosFile] File read successfully (${xmlContent.length} bytes)`);

    // Parse XML
    const eventData = parseMeosEventFile(xmlContent);

    return eventData;

  } catch (error) {
    console.error('❌ [MeosFile] Failed to read event file:', error);
    return null;
  }
}

/**
 * Get course length by class name
 */
export async function getCourseLength(className: string): Promise<number> {
  const eventData = await readCurrentMeosEvent();
  
  if (!eventData) {
    console.warn(`⚠️ [MeosFile] Could not get course length for ${className}`);
    return 0;
  }

  const classData = eventData.classes.find(c => c.name === className);
  
  if (!classData?.course) {
    console.warn(`⚠️ [MeosFile] No course found for class ${className}`);
    return 0;
  }

  return classData.course.length;
}

/**
 * Get all course lengths as a map: className -> length
 */
export async function getAllCourseLengths(): Promise<Record<string, number>> {
  const eventData = await readCurrentMeosEvent();
  
  if (!eventData) {
    return {};
  }

  const lengthMap: Record<string, number> = {};
  
  for (const classData of eventData.classes) {
    if (classData.course) {
      lengthMap[classData.name] = classData.course.length;
    }
  }

  console.log('📏 [MeosFile] Course lengths:', lengthMap);

  return lengthMap;
}

export default {
  parseMeosEventFile,
  readCurrentMeosEvent,
  getCourseLength,
  getAllCourseLengths,
};
