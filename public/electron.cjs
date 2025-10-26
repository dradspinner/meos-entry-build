const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');

// Enable Web Serial API and experimental features before app ready
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-web-serial');
app.commandLine.appendSwitch('enable-features', 'WebSerial');
app.commandLine.appendSwitch('enable-serial-port-web-driver');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');


let mainWindow;
let databaseManagerWindow = null;
let pythonServerProcess = null;

// Serial port selection handler on app (Electron 19+)
app.on('select-serial-port', (event, portList, webContents, callback) => {
  event.preventDefault();

  // Find Silicon Labs CP210x (vendor ID 0x10C4 = 4292 decimal)
  const siPorts = portList.filter(port => {
    const vid = port.vendorId;
    // vendorId can be string or number depending on Electron version
    return vid === 0x10C4 || vid === 4292 || vid === '4292' || vid === '0x10c4';
  });

  if (siPorts.length > 0) {
    callback(siPorts[0].portId);
  } else if (portList.length > 0) {
    callback(portList[0].portId);
  } else {
    callback('');
  }
});

// Also listen for serial port added/removed events
app.on('serial-port-added', (event, port) => {
  // Port added - no logging needed
});

app.on('serial-port-removed', (event, port) => {
  // Port removed - no logging needed
});

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false, // Allow local file access for development
      experimentalFeatures: true, // Enable experimental web features
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false, // Don't show until ready
    titleBarStyle: 'default'
  });

  // Load the app
  const devPort = process.env.VITE_PORT || 5174;
  const startUrl = isDev 
    ? `http://localhost:${devPort}` 
    : `file://${path.join(__dirname, '../dist/index.html')}`;
  
  mainWindow.loadURL(startUrl);


  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // DevTools can be opened via menu: View > Toggle Developer Tools
    // Uncomment below to auto-open DevTools in development:
    // if (isDev) {
    //   mainWindow.webContents.openDevTools();
    // }
  });

  // Handle errors
  mainWindow.webContents.on('crashed', () => {
    // Renderer process crashed - handle silently
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    // Failed to load - handle silently
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Close database manager if open
    if (databaseManagerWindow) {
      databaseManagerWindow.close();
      databaseManagerWindow = null;
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Setup serial port permissions and Web Serial API
function setupSerialPortPermissions() {
  const { session } = require('electron');
  
  // Use defaultSession (NOT fromPartition)
  const sess = session.defaultSession;
  
  
  // Handle permission requests for serial ports
  sess.setPermissionRequestHandler((webContents, permission, callback) => {
    // Allow serial port access for SportIdent readers
    if (permission === 'serial') {
      callback(true);
      return;
    }
    
    // Allow USB device access (alternative for some readers)
    if (permission === 'usb') {
      callback(true);
      return;
    }
    
    // Default deny for other permissions
    callback(false);
  });
  
  // Debug: Log when Web Serial API methods are called
  sess.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
    // This won't catch Web Serial API calls directly, but we can add console logging
    callback({ cancel: false });
  });
  
  // Handle serial port selection - Using both old and new APIs for compatibility
  
  // Try the newer setDevicePermissionHandler API (Electron 19+)
  sess.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'serial') {
      return true;
    }
    
    return false;
  });
  
  // Also try the old select-serial-port event (Electron <19)
  sess.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();

    // Find Silicon Labs devices (0x10C4)
    const siPorts = portList.filter(port => {
      const vid = port.vendorId;
      return vid === 0x10C4 || vid === '0x10c4' || vid === 4292;
    });

    if (siPorts.length > 0) {
      callback(siPorts[0].portId);
    } else if (portList.length > 0) {
      callback(portList[0].portId);
    } else {
      callback('');
    }
  });
  
  // Handle serial port permissions check
  sess.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    // Allow serial and USB permissions for our app
    if (permission === 'serial' || permission === 'usb') {
      return true;
    }
    
    return false;
  });
}

// Start Python server for Live Results
function startPythonServer() {
  const serverPath = path.join(__dirname, 'server.py');
  const publicDir = __dirname;
  
  console.log('[Electron] Starting MeOS Export Results server...');
  console.log('[Electron] Server path:', serverPath);
  console.log('[Electron] Working directory:', publicDir);
  
  // Try multiple Python command variations
  const pythonCommands = ['python', 'python3', 'py'];
  let pythonCmd = null;
  
  // Test which Python command works
  for (const cmd of pythonCommands) {
    try {
      const testProcess = spawn(cmd, ['--version'], { shell: true });
      testProcess.on('error', () => {});
      testProcess.on('exit', (code) => {
        if (code === 0 && !pythonCmd) {
          pythonCmd = cmd;
          console.log(`[Electron] Found Python command: ${cmd}`);
        }
      });
    } catch (e) {
      // Continue trying
    }
  }
  
  // Wait a moment for Python detection, then start server
  setTimeout(() => {
    if (!pythonCmd) {
      pythonCmd = 'python'; // fallback
      console.warn('[Electron] Could not detect Python, trying default "python" command');
    }
    
    try {
      // Spawn Python process with server.py
      // Use quoted path to handle spaces in directory names
      pythonServerProcess = spawn(pythonCmd, [`"${serverPath}"`], {
        cwd: publicDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        windowsVerbatimArguments: false
      });
      
      // Log server output
      pythonServerProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        console.log('[Python Server]', output);
      });
      
      pythonServerProcess.stderr.on('data', (data) => {
        const error = data.toString().trim();
        // Only log actual errors, not startup messages
        if (!error.includes('Starting') && !error.includes('Server will run')) {
          console.error('[Python Server Error]', error);
        } else {
          console.log('[Python Server]', error);
        }
      });
      
      pythonServerProcess.on('error', (error) => {
        console.error('[Electron] Failed to start Python server:', error.message);
        console.error('[Electron] Make sure Python is installed and in your PATH');
        console.error('[Electron] You can manually start the server by running:');
        console.error(`[Electron]   cd "${publicDir}"`);
        console.error(`[Electron]   python server.py`);
      });
      
      pythonServerProcess.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
          console.error(`[Electron] Python server exited with code ${code}`);
        }
        pythonServerProcess = null;
      });
      
      console.log('[Electron] Python server process started (PID:', pythonServerProcess.pid + ')');
      console.log('[Electron] Server should be available at http://localhost:8000');
      console.log('[Electron] Check for "Starting MeOS Live Results Server" message above');
    } catch (error) {
      console.error('[Electron] Error starting Python server:', error);
      console.error('[Electron] Python may not be installed or not in PATH');
    }
  }, 500); // Wait 500ms for Python detection
}

// Stop Python server
function stopPythonServer() {
  if (pythonServerProcess) {
    console.log('[Electron] Stopping Python server...');
    pythonServerProcess.kill();
    pythonServerProcess = null;
  }
}

// Run MySQL Network Setup
function runMySQLNetworkSetup() {
  const setupScriptPath = path.join(__dirname, 'setup-mysql-network.ps1');
  
  console.log('[Electron] Running MySQL Network Setup...');
  console.log('[Electron] Script path:', setupScriptPath);
  
  // Check if script exists
  if (!require('fs').existsSync(setupScriptPath)) {
    dialog.showErrorBox(
      'Setup Script Not Found',
      `Could not find setup script at:\n${setupScriptPath}\n\nPlease ensure setup-mysql-network.ps1 exists in the public folder.`
    );
    return;
  }
  
  // Show info dialog first
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    title: 'MySQL Network Setup',
    message: 'Configure MySQL for Network Access',
    detail: 'This will:\n' +
            '1. Create DVOA user for local and network access\n' +
            '2. Configure Windows Firewall to allow MySQL connections\n' +
            '3. Display your computer\'s IP address for other computers\n\n' +
            'Administrator privileges may be required for firewall configuration.\n\n' +
            'Default passwords:\n' +
            '  MySQL Root: DVOArunner\n' +
            '  DVOA User: DVOArunner',
    buttons: ['Continue', 'Cancel'],
    defaultId: 0,
    cancelId: 1
  });
  
  if (result === 1) {
    console.log('[Electron] MySQL setup cancelled by user');
    return;
  }
  
  try {
    // Run PowerShell script with elevated privileges
    const { spawn } = require('child_process');
    
    // Use Start-Process with -Verb RunAs to run as admin
    const psCommand = `Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File \"${setupScriptPath}\"" -Wait`;
    
    const setupProcess = spawn('powershell', [
      '-ExecutionPolicy', 'Bypass',
      '-Command', psCommand
    ], {
      shell: true,
      stdio: 'inherit'
    });
    
    setupProcess.on('error', (error) => {
      console.error('[Electron] Error running MySQL setup:', error);
      dialog.showErrorBox(
        'Setup Error',
        `Failed to run MySQL setup script:\n${error.message}`
      );
    });
    
    setupProcess.on('exit', (code) => {
      if (code === 0) {
        console.log('[Electron] MySQL setup completed successfully');
      } else {
        console.error(`[Electron] MySQL setup exited with code ${code}`);
      }
    });
    
    console.log('[Electron] MySQL setup process started');
    
  } catch (error) {
    console.error('[Electron] Error starting MySQL setup:', error);
    dialog.showErrorBox(
      'Setup Error',
      `Failed to start MySQL setup:\n${error.message}`
    );
  }
}

// App event handlers
app.whenReady().then(() => {
  // IMPORTANT: Set up serial port permissions BEFORE creating window
  setupSerialPortPermissions();
  
  // Start Python server for Live Results
  startPythonServer();
  
  createWindow();
  createMenuBar();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Stop Python server when app is quitting
  stopPythonServer();
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Ensure Python server is stopped before app quits
  stopPythonServer();
});

// Create database manager window
function createDatabaseManagerWindow() {
  // If window already exists, focus it
  if (databaseManagerWindow) {
    databaseManagerWindow.focus();
    return;
  }

  console.log('[Electron] Creating Database Manager window...');
  
  databaseManagerWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    title: 'Runner Database Manager'
  });

  // Load the app with database-manager route
  const devPort = process.env.VITE_PORT || 5174;
  const startUrl = isDev 
    ? `http://localhost:${devPort}/#/database-manager` 
    : `file://${path.join(__dirname, '../dist/index.html')}#/database-manager`;
  
  databaseManagerWindow.loadURL(startUrl);

  // Show window when ready
  databaseManagerWindow.once('ready-to-show', () => {
    databaseManagerWindow.show();
    console.log('[Electron] Database Manager window opened');
  });

  // Handle window closed
  databaseManagerWindow.on('closed', () => {
    console.log('[Electron] Database Manager window closed');
    databaseManagerWindow = null;
  });

  // Handle errors
  databaseManagerWindow.webContents.on('crashed', () => {
    console.error('[Electron] Database Manager window crashed');
  });

  databaseManagerWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Database Manager failed to load:', errorDescription);
  });
}

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
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Runner Database',
          click: () => {
            console.log('[Electron] Opening Runner Database window...');
            createDatabaseManagerWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Setup MySQL Network Access',
          click: () => {
            runMySQLNetworkSetup();
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

// Runner database cloud sync handlers
ipcMain.handle('save-runner-database', async (event, filePath, content) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    
    await fs.writeFile(filePath, content, 'utf8');
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('load-runner-database', async (event, filePath) => {
  try {
    const fs = require('fs').promises;
    const content = await fs.readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    return null;
  }
});

ipcMain.handle('choose-runner-database-path', async (event) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Choose Runner Database Location',
      defaultPath: 'runner_database.json',
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['createDirectory']
    });
    
    if (!result.canceled) {
      return result.filePath;
    }
    return null;
  } catch (error) {
    return null;
  }
});

// Write live results data to public/live_data.json
ipcMain.removeHandler('write-live-results');
ipcMain.handle('write-live-results', async (event, jsonContent) => {
  try {
    const fs = require('fs').promises;
    const liveDataPath = path.join(__dirname, 'live_data.json');
    await fs.writeFile(liveDataPath, jsonContent, 'utf8');
    console.log('[Electron] Successfully wrote live_data.json');
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to write live_data.json:', error);
    return { success: false, error: error.message };
  }
});

// Handle app updates (future enhancement)
ipcMain.handle('check-for-updates', async (event) => {
  // TODO: Implement auto-updater
  return { hasUpdates: false };
});

// Clipboard operations
ipcMain.handle('write-clipboard', async (event, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to write to clipboard:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-clipboard', async (event) => {
  try {
    const { clipboard } = require('electron');
    return clipboard.readText();
  } catch (error) {
    console.error('[Electron] Failed to read from clipboard:', error);
    return '';
  }
});

// Shell operations
ipcMain.handle('open-external', async (event, path) => {
  try {
    await shell.openPath(path);
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to open path:', error);
    return { success: false, error: error.message };
  }
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});