# MeOS Runner Database Service

This service reads the MeOS `database.wpersons` file directly to provide complete access to the historical runner database across all events.

## Why This Service is Needed

- The MeOS REST API only shows runners from the current event
- The `database.wpersons` file contains ALL runners from ALL events ever created in MeOS
- Web browsers cannot access local files directly for security reasons
- This Node.js service acts as a bridge to read the binary file and serve data via HTTP

## Quick Setup

1. **Open Terminal/Command Prompt**
   ```bash
   cd src/services/
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Start the Service**
   ```bash
   npm start
   ```

4. **Verify It's Working**
   - Service runs on http://localhost:3001
   - Open http://localhost:3001/health in your browser
   - You should see JSON with database stats

## What It Does

- **Automatically finds** your MeOS database file in standard locations:
  - `C:\Program Files\MeOS41\database.wpersons`
  - `C:\Program Files\MeOS40\database.wpersons`
  - `C:\Program Files\MeOS\database.wpersons`
  - `C:\Program Files (x86)\MeOS*\database.wpersons`

- **Parses the binary format** based on MeOS source code analysis:
  - Runner names (UTF-8, 96 bytes)
  - Card numbers (4 bytes)
  - Club numbers (4 bytes) 
  - Nationality (3 bytes)
  - Sex (1 byte: 77='M', 70='F')
  - Birth year (2 bytes)
  - External ID (8 bytes)
  - Removal flags (detects deleted runners)

- **Provides HTTP API**:
  - `GET /api/runners/search?q=name&limit=50` - Search runners
  - `GET /api/runners/all` - Get all runners
  - `GET /api/runners/stats` - Database statistics
  - `GET /health` - Service health check

## API Usage Examples

### Search for runners
```bash
curl "http://localhost:3001/api/runners/search?q=David+Radspinner&limit=10"
```

### Get all runners (large response)
```bash
curl "http://localhost:3001/api/runners/all"
```

### Check database stats
```bash
curl "http://localhost:3001/api/runners/stats"
```

## Integration with Entry Portal

Once the service is running, the Entry Portal will:

1. **Auto-detect** when the service is available
2. **Use MeOS database** as primary source for runner lookup (much faster than REST API)
3. **Learn automatically** - any runner found in MeOS database gets added to local cache
4. **Fallback gracefully** to REST API if database service is unavailable

## Auto-Completion Priority

The system now uses this lookup priority:

1. **Local Runner Cache** (instant - stored in browser)
2. **MeOS Database Service** (fast - this service reading database.wpersons)
3. **MeOS REST API** (slow - only current event runners)

## File Monitoring

The service automatically:
- **Detects file changes** - reloads when database.wpersons is updated
- **Caches parsed data** - only re-parses when file timestamp changes
- **Handles errors gracefully** - continues serving cached data if file becomes unavailable

## Development Mode

For development with auto-restart:
```bash
npm run dev
```

## Troubleshooting

### Service won't start
- Ensure Node.js is installed (v16+ recommended)
- Check if port 3001 is available
- Verify MeOS is installed in standard locations

### No runners found
- Check that MeOS has been used to create events with runners
- Verify database.wpersons file exists and is not empty
- Look at service logs for parsing errors

### Connection refused from browser
- Ensure service is running on http://localhost:3001
- Check Windows Firewall settings
- Verify CORS is enabled (should be automatic)

## File Format Details

Based on analysis of MeOS `RunnerDB.cpp`:

```
Header (12 bytes, optional):
- Version (4 bytes, little-endian)
- Data Date (4 bytes, little-endian) 
- Data Time (4 bytes, little-endian)

Each Runner Entry (120 bytes):
- Name (96 bytes, UTF-8, null-terminated)
- Card Number (4 bytes, little-endian int32)
- Club Number (4 bytes, little-endian int32)
- Nationality (3 bytes, UTF-8)
- Sex (1 byte, 77='M', 70='F')
- Birth Year (2 bytes, little-endian int16)
- Reserved/Flags (2 bytes, bit 0 = removed flag)
- External ID (8 bytes, little-endian int64)
```

## Security Notes

- Service only runs locally (localhost)
- No authentication required (local development only)
- Read-only access to MeOS database
- CORS enabled for browser access

---

This service gives you complete access to your historical MeOS runner database for intelligent auto-completion!