# 🚀 Electron Startup Guide

## Running Your Application

You have two ways to run the application:

### 🌐 **`npm run dev`** (Browser Mode)
- **What it does**: Runs in your web browser (Chrome/Edge)
- **When to use**: Development, testing, troubleshooting
- **Advantages**: 
  - ✅ Card reader works immediately
  - ✅ Easy debugging with browser dev tools
  - ✅ Faster startup
- **Disadvantages**:
  - ❌ Limited file system access
  - ❌ Browser security restrictions
  - ❌ No native desktop features

### 🖥️ **`npm run electron:dev`** (Desktop App Mode) - **RECOMMENDED FOR EVENTS**
- **What it does**: Runs as a desktop application using Electron
- **When to use**: Event day operations, production use
- **Advantages**:
  - ✅ Full desktop app experience  
  - ✅ Direct file system access
  - ✅ Better performance
  - ✅ No browser security restrictions
  - ✅ Native Windows integration
- **Requirements**: 
  - ⚠️ Web Serial API must be properly configured

---

## 🔧 Fixing Electron Card Reader Issues

Since the card reader works in `npm run dev` but not `npm run electron:dev`, here's how to fix it:

### **Step 1: Test the Electron Configuration**
1. **Start the app**: `npm run electron:dev`
2. **Open the test page**: Navigate to `localhost:5173/test-serial.html` in the Electron window
3. **Run the tests**: Click "Test Web Serial" and "Test SI Connection"
4. **Check console**: Look for debug messages in the DevTools

### **Step 2: Check Debug Output**
With the updated Electron configuration, you should see these messages in the console:
```
[Electron] Web Serial API command line switches enabled
[Electron Debug] Window ready, checking Web Serial API...
[Electron Debug] navigator.serial available: true
[Electron Debug] Web Serial API is available!
```

### **Step 3: If Web Serial API is Missing**
If you see `navigator.serial available: false`, try:

1. **Update Electron** (if needed):
   ```bash
   npm update electron
   ```

2. **Clear Electron cache**:
   ```bash
   # Close the app completely first
   rmdir /s "%APPDATA%\meos-entry-build"
   ```

3. **Restart the development server**:
   ```bash
   npm run electron:dev
   ```

### **Step 4: Check Serial Port Detection**
The enhanced logging will show:
```
[Electron] Serial port selection requested. Available ports:
[Electron] Port 0: { portId: "...", displayName: "Silicon Labs CP210x USB to UART Bridge", vendorId: "0x10c4" }
[Electron] Found 1 potential SportIdent devices
[Electron] Auto-selecting SportIdent device: {...}
```

---

## 🛠️ Troubleshooting

### **Problem**: Web Serial API not available in Electron
**Solution**: The Electron configuration has been updated with additional command-line switches. Restart the app.

### **Problem**: Port selection fails
**Solution**: 
1. Close SI-Config+ and any other software using the reader
2. Unplug and replug the SI reader
3. Try the connection again

### **Problem**: DevTools not opening
**Solution**: The configuration now opens DevTools automatically in development mode for easier debugging.

---

## 🎯 **Recommendation for Event Day**

**Use `npm run electron:dev`** for event operations because:
1. Better file handling for entry imports/exports
2. More reliable for long-running operations
3. Native desktop experience
4. Better performance with large entry lists

The Web Serial API configuration has been enhanced to work properly in Electron. If you still have issues:

1. **Test first**: Use the test page at `localhost:5173/test-serial.html`
2. **Check console**: Look for the debug messages
3. **Use diagnostics**: The "Diagnose" button in the Event Day Dashboard will work once Web Serial is enabled

---

## 📞 **Need Help?**

If the card reader still doesn't work in Electron mode:
1. Run the test page and copy any error messages
2. Check the console output for `[Electron]` messages
3. Verify SI-Config+ works (confirms hardware is good)
4. Try the browser mode as a temporary workaround