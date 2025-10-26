// Application Configuration Service
// Manages MeOS paths and other settings

import { existsSync } from 'fs';
import path from 'path';

export interface AppConfig {
  meosDataPath: string;  // Path to MeOS AppData folder (C:\Users\...\AppData\Roaming\Meos)
  meosApiUrl: string;    // MeOS REST API URL (default: http://localhost:2009/meos)
}

const CONFIG_KEY = 'meos_app_config';

/**
 * Get default MeOS data path based on OS
 */
export function getDefaultMeosDataPath(): string {
  const platform = process.platform;
  
  if (platform === 'win32') {
    // Windows: C:\Users\USERNAME\AppData\Roaming\Meos
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    return path.join(appData, 'Meos');
  } else if (platform === 'darwin') {
    // macOS: ~/Library/Application Support/Meos
    const home = process.env.HOME || '';
    return path.join(home, 'Library', 'Application Support', 'Meos');
  } else {
    // Linux: ~/.local/share/Meos or ~/Meos
    const home = process.env.HOME || '';
    return path.join(home, '.local', 'share', 'Meos');
  }
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): AppConfig {
  return {
    meosDataPath: getDefaultMeosDataPath(),
    meosApiUrl: 'http://localhost:2009/meos',
  };
}

/**
 * Load configuration from localStorage
 */
export function loadConfig(): AppConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      const config = JSON.parse(stored);
      console.log('⚙️ [Config] Loaded from localStorage:', config);
      return config;
    }
  } catch (error) {
    console.error('❌ [Config] Failed to load config:', error);
  }
  
  const defaultConfig = getDefaultConfig();
  console.log('⚙️ [Config] Using default config:', defaultConfig);
  return defaultConfig;
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    console.log('✅ [Config] Saved config:', config);
  } catch (error) {
    console.error('❌ [Config] Failed to save config:', error);
  }
}

/**
 * Update MeOS data path
 */
export function setMeosDataPath(newPath: string): boolean {
  // Validate path exists
  if (!existsSync(newPath)) {
    console.error(`❌ [Config] Path does not exist: ${newPath}`);
    return false;
  }

  const config = loadConfig();
  config.meosDataPath = newPath;
  saveConfig(config);
  
  console.log(`✅ [Config] MeOS data path updated to: ${newPath}`);
  return true;
}

/**
 * Update MeOS API URL
 */
export function setMeosApiUrl(newUrl: string): void {
  const config = loadConfig();
  config.meosApiUrl = newUrl;
  saveConfig(config);
  
  console.log(`✅ [Config] MeOS API URL updated to: ${newUrl}`);
}

/**
 * Verify MeOS data path is valid
 */
export function verifyMeosDataPath(dataPath?: string): boolean {
  const pathToCheck = dataPath || loadConfig().meosDataPath;
  
  if (!existsSync(pathToCheck)) {
    console.warn(`⚠️ [Config] MeOS data path not found: ${pathToCheck}`);
    return false;
  }
  
  console.log(`✅ [Config] MeOS data path verified: ${pathToCheck}`);
  return true;
}

/**
 * Auto-detect MeOS installation
 * Tries common locations
 */
export function autoDetectMeosPath(): string | null {
  const possiblePaths = [
    getDefaultMeosDataPath(),
    // Add other common locations
    'C:\\Program Files\\Meos',
    'C:\\Program Files (x86)\\Meos',
  ];

  for (const testPath of possiblePaths) {
    if (existsSync(testPath)) {
      console.log(`✅ [Config] Auto-detected MeOS at: ${testPath}`);
      return testPath;
    }
  }

  console.warn('⚠️ [Config] Could not auto-detect MeOS installation');
  return null;
}

/**
 * Reset configuration to defaults
 */
export function resetConfig(): void {
  const defaultConfig = getDefaultConfig();
  saveConfig(defaultConfig);
  console.log('🔄 [Config] Configuration reset to defaults');
}

export default {
  getDefaultConfig,
  loadConfig,
  saveConfig,
  setMeosDataPath,
  setMeosApiUrl,
  verifyMeosDataPath,
  autoDetectMeosPath,
  resetConfig,
};
