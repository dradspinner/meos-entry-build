# Live Results System

## Overview
The live results system displays real-time orienteering race results with automatic updates, showing checked-in runners, in-forest runners, and finishers with split analysis and time-lost calculations.

## Features

### Display Features
- **Multi-screen support**: Display results across multiple monitors (1-4 screens)
- **Medal highlights**: Gold, silver, and bronze backgrounds for top 3 finishers
- **Recent finisher bold text**: Runners who finished in the last 4 minutes appear in bold
- **Checked-in runner tracking**: Shows runners who checked in but haven't started yet
- **Separator line**: Visual distinction between finished runners and checked-in runners
- **Course information**: Displays course length and difficulty for each class
- **Auto-sorting**: Results sorted by finish time (fastest first)
- **User-selectable refresh rate**: 10s, 15s, 20s, 30s, or 60s intervals

### Data Sources
1. **MeOS XML Splits Export**: Primary source for finish times and split data
2. **Local Check-in Data**: Tracks runners checked in via the Event Day Dashboard
3. **MeOS REST API**: Real-time competition data (optional)

### Visual Indicators
- 🥇 **Gold background**: 1st place (with dark gold border, bold text)
- 🥈 **Silver background**: 2nd place (with gray border)
- 🥉 **Bronze background**: 3rd place (with brown border)
- **Bold text**: Recent finishers (within 4 minutes)
- **Italic "checked-in"**: Runners who haven't started yet
- **Horizontal line**: Separates finished runners from checked-in runners

## Architecture

### Components

#### 1. Live Results HTML (`public/live_results.html`)
- Standalone HTML page with embedded JavaScript
- Fetches data from multiple sources
- Generates popup windows for multi-screen display
- Auto-refresh with configurable interval
- Caches course lengths in localStorage

#### 2. Python Server (`public/server.py`)
- Serves the MeOS XML splits export file
- Serves `live_data.json` (checked-in runners from Electron)
- Runs on `http://localhost:8000`
- Automatically started by Electron app
- Handles CORS for cross-origin requests

#### 3. Electron Integration (`public/electron.cjs`)
- Automatically starts Python server on app launch
- Writes checked-in runner data to `live_data.json`
- Handles IPC communication for live data export
- Manages Python process lifecycle

#### 4. Event Day Dashboard Integration
- Exports checked-in runners to `live_data.json` on every refresh
- Opens live results in popup window via "Live Results" button in header
- Maintains checked-in runner list in localStorage

### Data Flow

```
MeOS → XML Export → Python Server → Live Results Page
                         ↓
Event Day Dashboard → live_data.json → Live Results Page
                         ↓
                    localStorage → Live Results Page
```

### Configuration

#### MeOS Setup
1. **Enable Auto-Export**:
   - Go to MeOS settings/preferences
   - Enable auto-export of results
   - Export to: `C:\Users\drads\OneDrive\DVOA\DVOA MeOS Advanced\splits test.xml`
   - Export format: IOF 3.0 XML with splits
   - Export interval: 10-30 seconds

2. **Update Python Server Path** (if needed):
   - Edit `public/server.py`, line 17
   - Update `self.splits_xml_path` to your MeOS export location

#### Live Results Configuration
- **Refresh interval**: Dropdown in header (10s-60s)
- **Screen count**: Dropdown in header (1-4 screens)
- **Settings persist**: Saved to localStorage

### API Endpoints

#### Python Server (port 8000)
- `GET /load-splits-xml`: Returns MeOS XML splits export
- `GET /live_data.json`: Returns checked-in runners from Electron
- `GET /[filename]`: Serves static files from public directory

#### MeOS REST API (port 2009)
- `GET /meos?get=class`: Returns class list
- `GET /meos?get=competition`: Returns competition info
- `GET /meos?get=status`: Health check endpoint

## Installation & Setup

### Prerequisites
- Python 3.x installed and in PATH
- Node.js and npm
- Electron app running (`npm run electron:dev`)

### Quick Start
1. **Start the application**:
   ```bash
   npm run electron:dev
   ```

2. **Configure MeOS auto-export** (see MeOS Setup above)

3. **Open live results**:
   - Click "Live Results" button in Event Day Dashboard header
   - Or open `http://localhost:8000/live_results.html` directly

4. **Select display options**:
   - Choose refresh interval (default: 15s)
   - Choose number of screens (default: 1)
   - Drag popup windows to separate monitors if using multi-screen

### Troubleshooting

#### Python Server Not Starting
**Symptoms**: Console errors about connection refused to port 8000

**Solutions**:
1. Check Electron console for Python server logs
2. Verify Python is installed: `python --version`
3. Manually start server:
   ```bash
   cd public
   python server.py
   ```
4. Check for port conflicts (another app using port 8000)

#### No Results Showing
**Symptoms**: "Waiting for Check-In" message or empty results

**Solutions**:
1. Verify MeOS is exporting to the correct location
2. Check Python server console for file read errors
3. Check browser console for XML parsing errors
4. Verify at least one runner has checked in or finished

#### XML Parsing Errors
**Symptoms**: Console errors about XML parsing

**Solutions**:
1. Verify MeOS export format is IOF 3.0 XML
2. Check for BOM or encoding issues in XML file
3. Ensure MeOS export file is not empty or corrupted
4. Try opening XML file in a text editor to verify validity

#### Course Lengths Showing as 5.0km
**Symptoms**: All courses show default 5.0km instead of actual length

**Solutions**:
1. Course lengths are cached from XML splits data
2. Wait for at least one finisher in each class (lengths are extracted from their results)
3. After first finisher, course length is cached for that class
4. Clear localStorage and refresh if cache is corrupted: `localStorage.clear()`

## Development

### File Structure
```
public/
├── live_results.html       # Main live results page
├── server.py               # Python server for XML/JSON serving
├── electron.cjs            # Electron main process
├── preload.cjs             # Electron preload script
└── live_data.json          # Auto-generated checked-in runners data

src/
└── components/
    ├── EventDayHome.tsx    # Event Day Dashboard (exports live_data.json)
    └── Header.tsx          # Contains "Live Results" button
```

### Key Functions

#### `live_results.html`
- `fetchResults()`: Main data fetching loop
- `mergeDataSources()`: Combines XML, local, and API data
- `generateClassHTML()`: Creates HTML for each class
- `generateScreenHTML()`: Creates popup window HTML
- `parseSplitsXml()`: Parses MeOS IOF 3.0 XML
- `calculateTimeLostForClass()`: MeOS-based split analysis

#### `server.py`
- `handle_splits_xml()`: Serves MeOS XML export
- `MeOSResultsHandler`: Custom HTTP request handler

#### `electron.cjs`
- `startPythonServer()`: Launches Python server
- `stopPythonServer()`: Cleanup on app exit
- IPC handler: `write-live-results`

### Testing
1. **Test with mock data**: Open `http://localhost:8000/live_results.html` without MeOS running
2. **Test multi-screen**: Change screen count and verify popup windows
3. **Test refresh interval**: Change interval and verify timing
4. **Test check-in flow**: Check in runner and verify appears in live results

## Technical Details

### Time Lost Calculation
Uses MeOS split analysis algorithm (`getSplitAnalysis`):
1. Calculate baseline times for each leg (2nd and 3rd place average)
2. Compare runner's leg times to baseline
3. Flag mistakes: >0.8% deviation AND >8% of leg time AND ≥15 seconds
4. Sum all mistakes for total time lost

### Course Length Caching
1. Extract from XML splits when runners finish
2. Store in localStorage: `meos_course_lengths`
3. Apply to all classes (including those with no finishers)
4. Persists across sessions

### Finish Timestamp Tracking
1. Record timestamp when runner first appears with finish time
2. Store in memory: `finishTimestamps` object
3. Use to calculate recent finishers (within 240 seconds)
4. Lost on page refresh (intentional - resets "recent" highlighting)

### Multi-Screen Window Management
1. Store window references in `screenWindows` array
2. Update existing windows without closing (preserves position)
3. Only open new windows when needed
4. Named windows prevent duplicate popups

## Future Enhancements
- [ ] Configurable recent finisher threshold (currently 4 minutes)
- [ ] Sound alerts for new finishers
- [ ] Export results to PDF/CSV
- [ ] Live results URL for public viewing (no check-in data)
- [ ] Real-time GPS tracking integration
- [ ] Performance metrics and graphs
- [ ] Historical comparison view

## Credits
- MeOS orienteering software: https://www.melin.nu/meos/
- IOF XML 3.0 standard
- DVOA Event Management System

## License
© 2024 DVOA - Delaware Valley Orienteering Association
