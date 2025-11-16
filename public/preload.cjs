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
  openLiveResults: () => ipcRenderer.invoke('open-live-results'),
  
  // MIP Server control
  mipServerStart: (options) => ipcRenderer.invoke('mip-server-start', options),
  mipServerStop: () => ipcRenderer.invoke('mip-server-stop'),
  mipServerStatus: () => ipcRenderer.invoke('mip-server-status'),
  checkMeOSRemoteInput: () => ipcRenderer.invoke('check-meos-remote-input'),
  
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
  
  // Serial debugging (no-op in production)
  debugSerial: () => {}
});

// Also expose as 'electron' for compatibility
contextBridge.exposeInMainWorld('electron', {
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  openExternal: (path) => ipcRenderer.invoke('open-external', path),
  // Menu event listeners
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeListener: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  }
});

// Silence console in renderer to avoid clutter
(() => { try { const noop = () => {}; console.log=noop; console.info=noop; console.warn=noop; console.error=noop; } catch(e) {} })();
