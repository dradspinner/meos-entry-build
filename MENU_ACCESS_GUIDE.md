# Menu Access Guide - SQL Runner Database Converter

## Overview

The SQL Runner Database Converter can be accessed in **two ways** within the MeOS Entry Build Electron application:

## Method 1: Electron Menu Bar (Recommended)

### Windows / Linux
1. Launch the MeOS Entry Build application
2. Look at the top menu bar
3. Click **Tools** → **SQL Runner Database Converter**
4. Or use the keyboard shortcut: **Ctrl+Shift+C**

### macOS
1. Launch the MeOS Entry Build application
2. Look at the top menu bar
3. Click **Tools** → **SQL Runner Database Converter**
4. Or use the keyboard shortcut: **Cmd+Shift+C**

### Menu Location

```
Menu Bar
├── File
├── Event
├── Tools ← Click here
│   ├── SQL Runner Database Converter ← Click here (Ctrl+Shift+C)
│   ├── ────────────
│   ├── Runner Database
│   ├── ────────────
│   └── Setup MySQL Network Access
├── View
└── Help
```

## Method 2: Dashboard Navigation

1. Launch the MeOS Entry Build application
2. From the main Dashboard screen, scroll down
3. Find the **"Tools & Utilities"** card (orange gradient)
4. Click the **"Launch Tools"** button
5. The SQL Runner Database Converter will be the first tool shown

### Visual Path
```
App Launch → Dashboard → [Tools & Utilities Card] → SQL Converter
```

## Quick Start

### Using the Menu (Fastest)
1. Press **Ctrl+Shift+C** (Windows/Linux) or **Cmd+Shift+C** (macOS)
2. Click **"Select SQL Database File to Convert"**
3. Choose your SQL runner database XML file
4. Wait for conversion (a few seconds)
5. Choose your action:
   - Download IOF XML file
   - Import directly to Runner Database

## Features Available from Menu

All features are identical whether you access the converter from the menu or the Dashboard:

- ✅ Convert SQL database XML to IOF XML 3.0
- ✅ Include all runners (members and non-members)
- ✅ View conversion statistics and errors
- ✅ Download converted IOF XML file
- ✅ Import directly to Runner Database
- ✅ Merge mode (adds new, updates existing)

## Menu Bar Benefits

### Advantages of Menu Access:
1. **Always Available**: Access from any screen in the app
2. **Keyboard Shortcut**: Fastest access with Ctrl+Shift+C
3. **Professional**: Standard desktop application experience
4. **Convenient**: Don't need to navigate back to Dashboard

### When to Use Menu Access:
- You're working in Event Builder or Event Day Ops
- You need quick access without navigation
- You prefer keyboard shortcuts
- You're familiar with desktop application menus

### When to Use Dashboard Access:
- You're new to the application and exploring features
- You want to see all available tools in one place
- You prefer visual navigation over menus

## Complete Tools Menu

The **Tools** menu contains all utility functions:

### SQL Runner Database Converter (NEW!)
- Convert DVOA SQL database exports to IOF XML
- Access: Tools → SQL Runner Database Converter
- Shortcut: Ctrl+Shift+C (Windows/Linux) or Cmd+Shift+C (macOS)

### Runner Database
- Opens the Runner Database Manager window
- Manage runner information and search database
- Access: Tools → Runner Database

### Setup MySQL Network Access
- Configure MySQL for network access
- Set up firewall rules
- Access: Tools → Setup MySQL Network Access

## Troubleshooting

### Menu Item Not Responding
1. Ensure you're running the Electron app (not web browser)
2. Check the console for error messages (View → Toggle Developer Tools)
3. Restart the application

### Keyboard Shortcut Not Working
1. Make sure the app window is focused (click on it)
2. Try using the menu with mouse instead
3. Check if another application is capturing the shortcut

### Menu Not Visible
- On Windows/Linux: Menu bar is always at the top of the window
- On macOS: Menu bar is at the top of the screen (standard macOS behavior)
- If hidden: Press Alt key to show menu (Windows/Linux)

## Technical Details

### How It Works

1. **Menu Click**: User clicks Tools → SQL Runner Database Converter
2. **IPC Message**: Electron sends 'menu-open-sql-converter' message
3. **React Handler**: App.tsx receives the message and switches to 'tools' view
4. **Component Load**: Tools.tsx component loads with SQL Converter interface

### Code Flow
```
electron.cjs (Menu) 
  → mainWindow.webContents.send('menu-open-sql-converter')
  → preload.cjs (IPC Bridge)
  → App.tsx (useEffect listener)
  → setCurrentView('tools')
  → Tools.tsx renders
```

## Related Documentation

- [SQL_RUNNER_CONVERTER.md](./SQL_RUNNER_CONVERTER.md) - Complete converter documentation
- [XML_IMPORT_FEATURE.md](./XML_IMPORT_FEATURE.md) - Runner database import feature
- [README.md](./README.md) - Main application documentation

## Updates and Versions

- **Version 1.0**: Menu integration added (October 2025)
- Menu shortcut: Ctrl+Shift+C (Windows/Linux) or Cmd+Shift+C (macOS)
- Compatible with all existing features
- No breaking changes to Dashboard navigation

## Support

If the menu item doesn't work or you have questions:
1. Try the Dashboard method as an alternative
2. Check View → Toggle Developer Tools for error messages
3. Ensure you're running the latest version of the app
4. Contact DVOA technical support with:
   - Operating system and version
   - Screenshot of the menu
   - Console error messages (if any)
