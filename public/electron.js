const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false // Allow local file access for development
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:5173' 
    : `file://${path.join(__dirname, '../dist/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Open DevTools in development
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  createWindow();
  createMenuBar();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Create application menu
function createMenuBar() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Event',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-event');
          }
        },
        {
          label: 'Open Event',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'MeOS XML Files', extensions: ['xml'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('menu-open-file', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Import OE File',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'OE Files', extensions: ['oe', 'xml'] },
                { name: 'CSV Files', extensions: ['csv'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('menu-import-oe', result.filePaths[0]);
            }
          }
        },
        {
          label: 'Export Data',
          click: () => {
            mainWindow.webContents.send('menu-export-data');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Event',
      submenu: [
        {
          label: 'Event Builder',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow.webContents.send('menu-switch-module', 'event-builder');
          }
        },
        {
          label: 'Same Day Operations',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow.webContents.send('menu-switch-module', 'same-day-operations');
          }
        },
        {
          label: 'Runner Database',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            mainWindow.webContents.send('menu-switch-module', 'runner-database');
          }
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Connect SI Reader',
          click: () => {
            mainWindow.webContents.send('menu-connect-si-reader');
          }
        },
        {
          label: 'Test MeOS Connection',
          click: () => {
            mainWindow.webContents.send('menu-test-meos-connection');
          }
        },
        { type: 'separator' },
        {
          label: 'Sync Runner Database',
          click: () => {
            mainWindow.webContents.send('menu-sync-database');
          }
        },
        {
          label: 'Backup Data',
          click: () => {
            mainWindow.webContents.send('menu-backup-data');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'User Manual',
          click: () => {
            shell.openExternal('https://github.com/dvoa/meos-entry-build/wiki');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/dvoa/meos-entry-build/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'About DVOA MeOS Tool',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About DVOA MeOS Event Builder',
              message: 'DVOA MeOS Event Builder and Check-in Tool',
              detail: 'Version 1.0.0\\n\\nA comprehensive Windows application for DVOA event management, combining pre-event setup, same-day operations, and runner database management.\\n\\n© 2024 DVOA'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers for file operations
ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    const fs = require('fs').promises;
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const fs = require('fs').promises;
    const content = await fs.readFile(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Handle app updates (future enhancement)
ipcMain.handle('check-for-updates', async (event) => {
  // TODO: Implement auto-updater
  return { hasUpdates: false };
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});