/// <reference types="vite/client" />

// Electron API types
interface ElectronAPI {
  onMenuEvent: (eventName: string, callback: () => void) => (() => void);
  saveRunnerDatabase: (filePath: string, content: string) => Promise<boolean>;
  loadRunnerDatabase: (filePath: string) => Promise<string | null>;
  chooseRunnerDatabasePath: () => Promise<string | null>;
  saveFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>;
  readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  showSaveDialog: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;
  checkForUpdates: () => Promise<{ hasUpdates: boolean }>;
  platform: string;
  isElectron: boolean;
  debugSerial: () => void;
  openExternal: (path: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    electron?: ElectronAPI; // Add alias for compatibility
  }
}

// SQL file imports
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

export {};
