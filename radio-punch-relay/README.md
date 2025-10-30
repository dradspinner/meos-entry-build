# MeOS Radio Punch Relay

Local relay service that reads punches from SportIdent radio dongles and delivers them to MeOS via the MIP (MeOS Input Protocol).

## Features

- ✅ **Auto-detect** SportIdent SRR USB dongles
- 📡 **Real-time** punch reception from wireless controls
- 🌐 **MIP Server** - MeOS-compatible protocol implementation
- ⚙️ **Control Mapping** - Map control codes to start/finish/check
- 📊 **Statistics** - Monitor punch flow and system health
- 🔄 **Auto-reconnect** - Handles dongle disconnections gracefully

## Requirements

- **Hardware**: SportIdent SRR USB dongle (wireless receiver)
- **Software**: 
  - Node.js 16+ 
  - MeOS running locally
  - Silicon Labs CP210x USB drivers (usually auto-installed)

## Installation

```bash
cd radio-punch-relay
npm install
```

## Quick Start

1. **Connect your SRR dongle** via USB

2. **Start the relay**:
   ```bash
   npm start
   ```

3. **Configure MeOS**:
   - Open MeOS
   - Go to: **Competition → Automatic tasks → Onlineinput**
   - Set URL: `http://localhost:8099/mip`
   - Set Competition ID: `1` (or your competition ID)
   - Set Interval: `10-15 seconds`
   - Click **"Start"**

4. **Map your start control**:
   ```
   > map 31 start
   ```
   Replace `31` with your start control code

## Interactive Commands

Once running, use these commands at the `>` prompt:

### Basic Commands
- `help` - Show available commands
- `status` - Show system status
- `stats` - Show detailed statistics
- `quit` - Exit relay

### Control Mapping
```bash
map <code> <type>    # Map control (e.g., "map 31 start")
unmap <code>         # Remove mapping
list                 # List all mappings
```

**Types**: `start`, `finish`, `check`

### Configuration
```bash
zero <date> <time>   # Set event zero time
                     # Example: zero 2024-01-15 10:00:00

compid <id>          # Set competition ID
                     # Example: compid 123

clear                # Clear all stored punches
```

## Example Session

```
==============================================
  MeOS Radio Punch Relay v1.0
  DVOA Orienteering Timing System
==============================================

Starting MIP server...
[MIP Server] MIP server listening on http://localhost:8099/mip
[MIP Server] Competition ID: 1

Connecting to SportIdent dongle...
[SI Reader] Connecting to COM3...
[SI Reader] Connected successfully
[SI Reader] Dongle initialized and listening for punches

✅ Radio Punch Relay is RUNNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 SI Dongle: Connected and listening
🌐 MIP Server: http://localhost:8099/mip
🔢 Competition ID: 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> map 31 start
✅ Mapped control 31 → start

> status

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SYSTEM STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📡 SI Dongle:
   Status: ✅ Connected
   Punches Received: 12
   Errors: 0
   Uptime: 0h 5m 23s

🌐 MIP Server:
   URL: http://localhost:8099/mip
   Punches Stored: 12
   Punches Served: 12
   MeOS Requests: 8
   Control Mappings: 1

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## How It Works

```
┌─────────────────┐
│  SI Radio       │
│  Controls       │  Wireless transmission
│  (in forest)    │──────────────────┐
└─────────────────┘                  │
                                     ▼
                            ┌─────────────────┐
                            │  SRR Dongle     │
                            │  (USB)          │
                            └────────┬────────┘
                                     │ Serial (38400 baud)
                                     │
                                     ▼
                            ┌─────────────────┐
                            │  Radio Punch    │
                            │  Relay          │
                            │  (this tool)    │
                            └────────┬────────┘
                                     │ HTTP/XML (MIP)
                                     │
                                     ▼
                            ┌─────────────────┐
                            │     MeOS        │
                            │  (polls every   │
                            │   10-15 sec)    │
                            └─────────────────┘
```

## Troubleshooting

### Dongle Not Detected

**Symptoms**: `No SportIdent dongle detected` error

**Solutions**:
1. Check USB connection
2. Install [Silicon Labs CP210x drivers](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)
3. Check Windows Device Manager for "Silicon Labs" device
4. Try different USB port
5. Restart computer

### MeOS Not Receiving Punches

**Symptoms**: MeOS shows 0 updates, relay shows punches received

**Check**:
1. MeOS Online Input is **started** and **enabled**
2. URL is exactly: `http://localhost:8099/mip`
3. Competition ID matches (check with `status` command)
4. MeOS is polling (check "Last Request" in relay status)
5. Control is mapped correctly (use `list` command)

### Time Issues

**Symptoms**: Punches appear with wrong times in MeOS

**Solution**: Set event zero time in relay:
```bash
> zero 2024-01-15 10:00:00
```
Use same date and zero time as configured in MeOS.

### Port Already in Use

**Symptoms**: `Error: listen EADDRINUSE: address already in use :::8099`

**Solutions**:
1. Check if relay is already running (close other instance)
2. Change port in `src/index.js`: `mipPort: 8100`
3. Update MeOS URL to match new port

## Configuration File (Optional)

Create `config.json` in the `radio-punch-relay` folder:

```json
{
  "mipPort": 8099,
  "competitionId": 1,
  "siPortPath": null,
  "debug": false,
  "eventDate": "2024-01-15",
  "zeroTime": "10:00:00",
  "controlMappings": {
    "31": "start",
    "32": "finish",
    "30": "check"
  }
}
```

## Advanced: Protocol Details

### MIP (MeOS Input Protocol)

The relay implements MeOS's XML-based polling protocol:

**Request from MeOS**:
```
GET /mip?competition=1&lastid=0
```

**Response from Relay**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<MIPData lastid="3">
  <p card="123456" code="31" time="36450" type="start"/>
  <p card="123457" code="42" time="36892"/>
  <p card="123456" code="100" time="38123"/>
</MIPData>
```

- `lastid`: Highest punch ID (MeOS uses for incremental fetching)
- `card`: SI card number
- `code`: Control code
- `time`: Time in 1/10 seconds since event zero time
- `type`: Optional - `start`, `finish`, or `check`

## Development

```bash
# Install dependencies
npm install

# Run in development mode (auto-restart)
npm run dev

# Run tests
npm test
```

## License

MIT License - DVOA

## Support

For issues or questions:
- Check MeOS documentation for Online Input configuration
- Verify dongle is in SRR mode (mode 11 - wireless receiver)
- Check `status` output for diagnostic information