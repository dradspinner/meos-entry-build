# Running the MeOS Entry Build Application

> 📚 **Quick Navigation**: See [DOCS_INDEX.md](DOCS_INDEX.md) for complete documentation index

## Development Modes

This app can run in two different modes:

### 1. Web Development Mode (Limited Features)
```bash
npm run dev
```
- Runs in your browser using Vite dev server
- **Does NOT have Electron APIs** (no file system access, no file picker, etc.)
- Good for quick UI development and testing React components
- Database Manager will show "No Cloud Sync Configured" warning
- Cannot browse for files or access native features

### 2. Electron Development Mode (Full Features) ⭐ **RECOMMENDED**
```bash
npm run electron:dev
```
- Runs as a full desktop application
- **Has ALL Electron APIs** (file system, file picker, native dialogs, etc.)
- Full cloud sync capabilities
- Can browse for runner database files
- Access to serial ports for SI card readers
- This is how the app is meant to be used!

## Database Manager Features

When running in **Electron mode**, the Database Manager has:
- ✅ Direct file system access to cloud JSON file
- ✅ File picker to browse for cloud database path
- ✅ Automatic sync across all windows
- ✅ Real-time updates from other windows
- ✅ Full runner database management

When running in **Web mode** (not recommended for production use):
- ⚠️ Manual path entry only (no file picker)
- ⚠️ Limited to localStorage only
- ⚠️ Shows warnings about missing Electron features

## Production Build

To build and package the app for distribution:

```bash
# Build for Windows (64-bit)
npm run pack:win

# Build for all Windows architectures
npm run pack:all

# Create distributable installer
npm run electron:dist
```

The built app will be in the `dist-electron` folder.

## Troubleshooting

### "No Cloud Sync Configured" Warning
- You're likely running in web mode (`npm run dev`)
- Solution: Stop the dev server and run `npm run electron:dev` instead

### File Picker Not Working
- Check if you're in Electron mode by looking for the Electron window frame
- Web mode doesn't have access to native file dialogs

### Changes Not Showing in Database Manager
- Make sure you're viewing the same localStorage instance
- In Electron, all windows share the same localStorage
- Refresh the Database Manager window to see latest changes

## Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. **Run in Electron mode**: `npm run electron:dev`
4. Open Database Manager from: **Tools → Runner Database**
5. Click "Configure Cloud Sync" to set your database path
6. Start managing your runner database!
