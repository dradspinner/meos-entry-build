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
  
  // Menu event listeners
  onMenuEvent: (callback) => {
    ipcRenderer.on('menu-new-event', callback);
    ipcRenderer.on('menu-open-file', callback);
    ipcRenderer.on('menu-import-oe', callback);
    ipcRenderer.on('menu-export-data', callback);
    ipcRenderer.on('menu-switch-module', callback);
    ipcRenderer.on('menu-connect-si-reader', callback);
    ipcRenderer.on('menu-test-meos-connection', callback);
    ipcRenderer.on('menu-sync-database', callback);
    ipcRenderer.on('menu-backup-data', callback);
  },
  
  // App info
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  
  // Platform info
  platform: process.platform,
  isElectron: true
});

// Log when preload is ready
console.log('[Preload] Electron API exposed to renderer process');