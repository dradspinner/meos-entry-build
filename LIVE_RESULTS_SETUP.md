# Live Results Setup Guide

## Overview

The Live Results system now uses a **configurable XML export path** based on your event's working directory. This makes it easier to manage multiple events and ensures all event files are kept together.

## What Changed

### Before
- Hardcoded XML path: `C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\splits test.xml`
- Required editing `server.py` to change the path
- Different path for each event

### After
- **Dynamic path**: Based on your event's working directory
- **Standard filename**: `MeOS Live Export.xml`
- **User-friendly**: Path displayed in the app before starting Live Results
- **No code changes needed**: Everything configured through the UI

## Setup Instructions

### Step 1: Set Working Directory (if needed)

The working directory is automatically set when you:
- Import a CSV file
- Import Jotform data
- Load an event JSON file

**If you haven't imported data yet**, when you click "Live Results", the system will prompt you to select a working directory:
1. Click **"Live Results"** button
2. A modal will appear asking you to set a working directory
3. Click **"Select Working Directory"**
4. Choose or create a folder for your event (e.g., `C:\Users\YourName\Documents\HickoryRun_2025`)
5. Click **"Select Folder"**

### Step 2: View the Export Path

Once the working directory is set:
1. The setup modal will appear showing you the **full XML export path**
2. This is where MeOS should export its splits data

Example path:
```
C:\Users\drads\Documents\HickoryRun_Event\MeOS Live Export.xml
```

### Step 3: Copy the Path

Click the **"Copy Path"** button to copy the full path to your clipboard.

### Step 4: Configure MeOS Auto-Export

In MeOS:

1. Go to **Settings → Auto Export** (or similar menu)
2. **Paste the full path** from Step 3 into the export path field
3. Set the filename to: `MeOS Live Export.xml`
4. Set the export format to: **IOF 3.0 XML with splits**
5. Set refresh interval: **10-30 seconds** (recommended)
6. **Enable auto-export**

### Step 5: Continue to Live Results

Click **"Continue to Live Results"** in the modal to open the Live Results display.

---

## Quick Summary

**If working directory already set** (you've imported data):
- Click "Live Results" → Copy path → Configure MeOS → Continue

**If working directory NOT set** (fresh event):
- Click "Live Results" → Select working directory → Copy path → Configure MeOS → Continue

## File Locations

Your event files will be organized like this:

```
C:\Users\YourName\Documents\EventName\
├── MeOS Live Export.xml        ← MeOS auto-exports here
├── meos_entries_*.json         ← Event entry backups
├── live_data.json              ← Checked-in runners (auto-generated)
└── [other event files]
```

All files for one event stay in the same folder!

## Python Server

The Python server (`server.py`) now:
- Accepts a command-line argument for the XML path
- Defaults to `MeOS Live Export.xml` in the current directory
- Shows clear messages when the XML file is found or missing

### Manual Server Start (Optional)

If you need to start the server manually:

```bash
cd public
python server.py
```

Or with a custom XML path:

```bash
python server.py "C:\path\to\your\event\MeOS Live Export.xml"
```

## Troubleshooting

### "Working directory not set"

**Problem**: The modal shows "Working directory not set - please import event data first"

**Solution**: Import your event data (CSV, Jotform, or JSON) to establish the working directory.

### MeOS XML file not found

**Problem**: Python server console shows "⚠️ MeOS splits file NOT FOUND"

**Solutions**:
1. Verify MeOS auto-export is enabled and running
2. Check the export path in MeOS matches exactly what's shown in the modal
3. Ensure the filename is exactly: `MeOS Live Export.xml` (case-sensitive on some systems)
4. Check MeOS has permission to write to that folder

### Live Results not updating

**Problem**: Live results page shows stale data or "Waiting for Check-In"

**Solutions**:
1. Check MeOS auto-export is actively running (watch for file timestamp changes)
2. Verify the Python server is running (should show in Electron console)
3. Check browser console for XML parsing errors
4. Try refreshing the Live Results page

### Port conflicts

**Problem**: Python server won't start due to port 8001 being in use

**Solutions**:
1. Close any other apps using port 8001
2. Restart the Electron app
3. Check Windows Task Manager for python.exe processes and end them

## Benefits of This Approach

1. **Organized**: All event files in one folder
2. **Portable**: Copy the event folder to move everything
3. **Multi-event**: Each event has its own folder and XML export
4. **User-friendly**: No code editing required
5. **Clear setup**: Step-by-step instructions shown in the app

## Technical Details

### Components Modified

- **server.py**: Now accepts XML path as command-line argument
- **Header.tsx**: Added setup modal showing export path
- **live_results.html**: Updated to use port 8001 and added documentation

### Port Numbers

- **8001**: Python server (XML and JSON files)
- **2009**: MeOS REST API (optional)

### File Naming Convention

Per user preference, the filename uses underscores instead of hyphens:
- ✅ `MeOS_Live_Export.xml` (preferred)
- ✅ `MeOS Live Export.xml` (also works, spaces are fine)

## Advanced Configuration

### Custom Server Port

Edit `server.py` line ~102 to change the port:

```python
PORT = 8001  # Change to your preferred port
```

Then update `live_results.html` line ~274:

```javascript
const PYTHON_SERVER = 'http://localhost:8001';
```

### Multiple Events

To run live results for multiple events simultaneously:

1. Start separate Python servers on different ports
2. Point each server to its event's XML file
3. Open live results pages for each event

Example:
```bash
# Event 1
cd event1
python ../public/server.py "MeOS Live Export.xml" --port 8001

# Event 2
cd event2
python ../public/server.py "MeOS Live Export.xml" --port 8002
```

## Support

For issues or questions:
1. Check the browser console for errors
2. Check the Electron console for Python server logs
3. Review `LIVE_RESULTS_README.md` for detailed troubleshooting
4. Verify MeOS export path and filename exactly match

---

**Last Updated**: 2025-10-22
