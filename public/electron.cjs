const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { spawn } = require('child_process');
const os = require('os');
const MIPServer = require('./mip-server.cjs');
const SportIdentReader = require('./sportident-reader.cjs');

// Silence console noise in dev and prod (can be toggled with env var)
const SUPPRESS_CONSOLE = process.env.MEOS_QUIET_LOGS !== '0';
if (SUPPRESS_CONSOLE) {
  const noop = () => {};
  try { console.log = noop; } catch {}
  try { console.info = noop; } catch {}
  try { console.warn = noop; } catch {}
  try { console.error = noop; } catch {}
}

// Fix cache permission issues on Windows with OneDrive
// Set app paths to local temp directory instead of OneDrive-synced locations
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const appCachePath = path.join(localAppData, 'meos-entry-build-cache');
const appDataPath = path.join(localAppData, 'meos-entry-build');

app.setPath('userData', appDataPath);
app.setPath('cache', appCachePath);
app.setPath('sessionData', path.join(appDataPath, 'Session Storage'));

// Enable Web Serial API and experimental features before app ready
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-web-serial');
app.commandLine.appendSwitch('enable-features', 'WebSerial');
app.commandLine.appendSwitch('enable-serial-port-web-driver');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');


let mainWindow;
let databaseManagerWindow = null;
let pythonServerProcess = null;
let mipServer = null;
let siReader = null;

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
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
    const psCommand = `Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy','Bypass','-File','"${setupScriptPath}"' -Wait`;
    
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
  
  // Stop SI reader and MIP server when app is quitting
  if (siReader) {
    siReader.disconnect().catch(err => console.error('[Electron] Error disconnecting SI reader:', err));
    siReader = null;
  }
  
  if (mipServer) {
    mipServer.stop().catch(err => console.error('[Electron] Error stopping MIP server:', err));
    mipServer = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Ensure Python server is stopped before app quits
  stopPythonServer();
  
  // Ensure SI reader and MIP server are stopped before app quits
  if (siReader) {
    siReader.disconnect().catch(err => console.error('[Electron] Error disconnecting SI reader:', err));
    siReader = null;
  }
  
  if (mipServer) {
    mipServer.stop().catch(err => console.error('[Electron] Error stopping MIP server:', err));
    mipServer = null;
  }
});

// Create live results window
function createLiveResultsWindow() {
  console.log('[Electron] Creating Live Results window...');
  
  const liveResultsWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    title: 'Live Results Display',
    show: false
  });

  // Load the live results HTML
  const liveResultsPath = isDev 
    ? `http://localhost:${process.env.VITE_PORT || 5174}/live_results.html` 
    : `file://${path.join(__dirname, 'live_results.html')}`;
  
  console.log('[Electron] Loading live results from:', liveResultsPath);
  liveResultsWindow.loadURL(liveResultsPath);

  // Show window when ready
  liveResultsWindow.once('ready-to-show', () => {
    liveResultsWindow.show();
    console.log('[Electron] Live Results window opened');
  });

  // Handle errors
  liveResultsWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Live Results failed to load:', errorDescription);
  });
}

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
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
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
          label: 'SQL Runner Database Converter',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => {
            console.log('[Electron] Opening SQL Runner Database Converter...');
            mainWindow.webContents.send('menu-open-sql-converter');
          }
        },
        { type: 'separator' },
        {
          label: 'Runner Database',
          click: () => {
            console.log('[Electron] Opening Runner Database window...');
            createDatabaseManagerWindow();
          }
        },
        {
          label: 'Database Cleanup',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => {
            console.log('[Electron] Opening Database Cleanup...');
            mainWindow.webContents.send('menu-open-database-cleanup');
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

// Open live results window
ipcMain.handle('open-live-results', async (event) => {
  try {
    createLiveResultsWindow();
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to open live results:', error);
    return { success: false, error: error.message };
  }
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

// MIP Server control
ipcMain.handle('mip-server-start', async (event, options = {}) => {
  try {
    if (mipServer) {
      console.log('[Electron] MIP server already running');
      return { success: true, alreadyRunning: true };
    }
    
    console.log('[Electron] Starting MIP server...');
    mipServer = new MIPServer({
      port: options.port || 8099,
      competitionId: options.competitionId || 0
    });
    
    await mipServer.start();
    console.log('[Electron] MIP server started successfully');
    
    // Try to connect SportIdent reader
    try {
      console.log('[Electron] Connecting to SportIdent dongle...');
      siReader = new SportIdentReader({
        autoDetect: true,
        debug: false
      });
      
      // Set up punch handler to forward to MIP server
      siReader.on('punch', (punch) => {
        console.log(`[Electron] Punch received: Card=${punch.cardNumber} Control=${punch.controlCode}`);
        mipServer.addPunch(punch);
        
        // Notify renderer of punch
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('si-punch', punch);
        }
      });
      
      siReader.on('error', (error) => {
        console.error('[Electron] SI Reader error:', error.message);
      });
      
      siReader.on('disconnected', () => {
        console.log('[Electron] SI Dongle disconnected');
      });
      
      await siReader.connect();
      console.log('[Electron] SportIdent dongle connected successfully');
      
    } catch (siError) {
      console.warn('[Electron] Could not connect SportIdent dongle:', siError.message);
      console.warn('[Electron] MIP server is running but will not receive punches until dongle is connected');
      // Don't fail - MIP server can run without SI reader for testing
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to start MIP server:', error);
    mipServer = null;
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mip-server-stop', async (event) => {
  try {
    if (!mipServer) {
      console.log('[Electron] MIP server not running');
      return { success: true, notRunning: true };
    }
    
    console.log('[Electron] Stopping MIP server...');
    
    // Disconnect SI reader first with timeout protection
    if (siReader) {
      try {
        // Add timeout to prevent hanging
        const disconnectPromise = siReader.disconnect();
        const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000));
        await Promise.race([disconnectPromise, timeoutPromise]);
        console.log('[Electron] SportIdent dongle disconnected');
      } catch (err) {
        console.error('[Electron] Error disconnecting SI reader:', err);
      }
      siReader = null;
    }
    
    // Stop MIP server with timeout protection
    try {
      const stopPromise = mipServer.stop();
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 2000));
      await Promise.race([stopPromise, timeoutPromise]);
    } catch (err) {
      console.error('[Electron] Error stopping MIP server:', err);
    }
    
    mipServer = null;
    console.log('[Electron] MIP server stopped');
    
    return { success: true };
  } catch (error) {
    console.error('[Electron] Failed to stop MIP server:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mip-server-status', async (event) => {
  try {
    if (!mipServer) {
      return { 
        success: true, 
        running: false,
        siReaderConnected: false
      };
    }
    
    // Check if server is actually responding
    const stats = mipServer.getStatistics();
    
    // Check SI reader status
    let siReaderStats = null;
    let siReaderConnected = false;
    if (siReader) {
      siReaderStats = siReader.getStatistics();
      siReaderConnected = siReaderStats.connected;
    }
    
    return { 
      success: true, 
      running: true,
      port: mipServer.port,
      competitionId: mipServer.competitionId,
      statistics: stats,
      siReaderConnected: siReaderConnected,
      siReaderStatistics: siReaderStats
    };
  } catch (error) {
    console.error('[Electron] Failed to get MIP server status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-meos-remote-input', async (event) => {
  try {
    // Check if MeOS is polling the MIP server
    // We can detect this by checking if we've had recent requests
    if (!mipServer) {
      return { 
        success: true, 
        running: false,
        message: 'MIP server not started'
      };
    }
    
    const stats = mipServer.getStatistics();
    const lastRequest = stats.lastRequest;
    
    if (!lastRequest) {
      return {
        success: true,
        running: false,
        message: 'No requests received yet from MeOS'
      };
    }
    
    // Consider MeOS connected if we've had a request in the last 60 seconds
    const secondsSinceLastRequest = Math.floor((Date.now() - lastRequest.getTime()) / 1000);
    const isConnected = secondsSinceLastRequest < 60;
    
    return {
      success: true,
      running: isConnected,
      message: isConnected 
        ? `MeOS connected (last request ${secondsSinceLastRequest}s ago)`
        : `No recent requests (last request ${secondsSinceLastRequest}s ago)`,
      lastRequestTime: lastRequest,
      secondsSinceLastRequest
    };
  } catch (error) {
    console.error('[Electron] Failed to check MeOS remote input:', error);
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