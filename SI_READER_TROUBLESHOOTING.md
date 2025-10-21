# SportIdent Card Reader Troubleshooting Guide

## Current Issue: Cannot Connect Card Reader on Event Day Dashboard

### Quick Checklist
1. **Reader is plugged in** ✓
2. **Windows recognizes the device** ❓
3. **Browser supports Web Serial API** ❓  
4. **Correct reader type (BSF8 USB)** ❓
5. **No other software using the port** ❓

---

## Step 1: Verify Hardware Connection

### Check Windows Device Manager
1. Open **Device Manager** (Windows + X, then M)
2. Look for your SportIdent reader under:
   - **Ports (COM & LPT)** - Should show "Silicon Labs CP210x" or similar
   - **Universal Serial Bus controllers** - Should show USB device
3. **Red X or yellow warning?** = Driver issue
4. **Not visible at all?** = Hardware/cable issue

### Expected Device Info
- **BSF8 USB Reader**: Silicon Labs CP210x USB to UART Bridge
- **Vendor ID**: 0x10C4
- **Product ID**: 0xEA60

---

## Step 2: Browser and API Support

### Check Web Serial API Support
Open browser console (F12) and run:
```javascript
console.log('Web Serial supported:', 'serial' in navigator);
```
Should return: `Web Serial supported: true`

### Supported Browsers
- ✅ **Chrome/Chromium** (recommended)
- ✅ **Microsoft Edge**
- ❌ **Firefox** (not supported)
- ❌ **Safari** (not supported)

---

## Step 3: Common Connection Failures

### Error: "No port selected"
**Cause**: Port selection dialog didn't show any devices
**Solutions**:
1. Unplug and replug the SI reader
2. Try a different USB port
3. Check Windows Device Manager for device recognition
4. Install/update Silicon Labs CP210x drivers

### Error: "Failed to connect"
**Cause**: Port is in use by another application
**Solutions**:
1. Close MeOS if it's running
2. Close any other SI software
3. Check Windows Task Manager for background processes
4. Restart the application

### Error: "Web Serial API not supported"
**Cause**: Wrong browser or browser too old
**Solutions**:
1. Switch to Chrome or Edge
2. Update your browser
3. Enable experimental features in Chrome: `chrome://flags/#enable-experimental-web-platform-features`

---

## Step 4: Driver Issues (Windows)

### Install Silicon Labs CP210x Drivers
1. Download from: https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers
2. Run installer as Administrator
3. Restart computer
4. Replug SI reader

### Verify Driver Installation
1. Open Device Manager
2. Look for "Silicon Labs CP210x USB to UART Bridge" under Ports
3. Right-click → Properties → Driver tab
4. Should show Silicon Labs as provider

---

## Step 5: Advanced Troubleshooting

### Test with Direct Browser Access
1. Open Chrome
2. Go to: `chrome://settings/content/serialPorts`
3. Check if your site has permission
4. Try connecting from a simple webpage

### Check Electron Permissions
The app should automatically handle permissions, but if issues persist:
1. Close the app completely
2. Delete Electron cache: `%APPDATA%\meos-entry-build`
3. Restart the application

### Enable Debug Logging
1. Open Developer Tools (F12)
2. Go to Console tab
3. Look for `[SI Reader]` messages when connecting
4. Note any error messages

---

## Step 6: Hardware Testing

### Test with Other SI Software
1. Try connecting with MeOS SI tab
2. Try with SportIdent Config+ software
3. If these work, it's a software issue
4. If these don't work, it's a hardware/driver issue

### Try Different USB Ports
- Use USB 2.0 ports if available
- Avoid USB hubs if possible
- Try front and back panel ports

---

## Emergency Workarounds

### If Card Reader Won't Connect
1. **Use MeOS Direct**: Operate through MeOS SI tab
2. **Manual Check-in**: Use card number input field
3. **Test Card Function**: Use "Test Card Read" button in dashboard

### Test Card Read Function
The dashboard has a test function:
```javascript
// In browser console
sportIdentService.testCardRead(123456); // Test with card number
```

---

## Common Error Messages and Solutions

| Error Message | Likely Cause | Solution |
|---------------|--------------|----------|
| "device_event_log_impl.cc: Failed to read port name" | Windows serial enumeration issue | Update Electron, restart app |
| "No port selected by user" | User canceled dialog or no ports visible | Check device manager, replug reader |
| "Port not writable" | Port in use by another app | Close MeOS/other SI software |
| "DOMException: Failed to open serial port" | Permission or driver issue | Check permissions, update drivers |

---

## Getting Help

### Gather This Info
1. **Browser**: Chrome/Edge version
2. **OS**: Windows version
3. **Reader Model**: BSF8 USB or other
4. **Device Manager**: Screenshot of Ports section
5. **Console Errors**: Any error messages from F12 console

### Contact Support
- Include the above information
- Describe exact steps when error occurs
- Mention if it worked before (when it stopped working)