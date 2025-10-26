const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Runner database cloud sync
  saveRunnerDatabase: (filePath, content) => ipcRenderer.invoke('save-runner-database', filePath, content),
  loadRunnerDatabase: (filePath) => ipcRenderer.invoke('load-runner-database', filePath),
  chooseRunnerDatabasePath: () => ipcRenderer.invoke('choose-runner-database-path'),
  
  // File operations
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Live results export
  writeLiveResults: (jsonContent) => ipcRenderer.invoke('write-live-results', jsonContent),
  
  // Menu event listeners
  onMenuEvent: (eventName, callback) => {
    ipcRenderer.on(eventName, callback);
    // Return cleanup function to remove this specific listener
    return () => {
      ipcRenderer.removeListener(eventName, callback);
    };
  },
  
  // App info
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // Platform info
  platform: process.platform,
  isElectron: true,
  
  // Clipboard operations
  writeClipboard: (text) => ipcRenderer.invoke('write-clipboard', text),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),
  
  // Shell operations
  openExternal: (path) => ipcRenderer.invoke('open-external', path),
  
  // Serial debugging
  debugSerial: () => {
    console.log('[Preload] Serial API check:', {
      hasSerial: 'serial' in navigator,
      userAgent: navigator.userAgent,
      platform: process.platform
    });
    
    if ('serial' in navigator) {
      // Log serial API methods availability
      console.log('[Preload] Serial API methods:', {
        getPorts: typeof navigator.serial.getPorts,
        requestPort: typeof navigator.serial.requestPort
      });
    }
  }
});

// Also expose as 'electron' for compatibility
contextBridge.exposeInMainWorld('electron', {
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  openExternal: (path) => ipcRenderer.invoke('open-external', path),
});

// Log when preload is ready
console.log('[Preload] Electron API exposed to renderer process');
console.log('[Preload] Serial API available:', 'serial' in navigator);
