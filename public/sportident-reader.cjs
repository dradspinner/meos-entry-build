/**
 * SportIdent Radio Dongle Reader
 * 
 * Reads punches from SportIdent SRR USB dongles (wireless radio receivers)
 * Based on MeOS SportIdent.cpp implementation
 */

const { SerialPort } = require('serialport');
const EventEmitter = require('events');

// SI Protocol Constants (from SportIdent.h)
const SI = {
  STX: 0x02,  // Start of transmission
  ETX: 0x03,  // End of transmission
  ACK: 0x06,  // Acknowledge
  DLE: 0x10,  // Data link escape
  NAK: 0x15,  // Negative acknowledge
  WAKEUP: 0xFF,
  
  // Commands
  CMD_GET_SI5: 0xB1,
  CMD_GET_SI6: 0xE1,
  CMD_GET_SI8: 0xEF,
  CMD_GET_SI9: 0xE8,
  CMD_GET_PCARD: 0xE2,
  CMD_GET_SYSTEM_VALUE: 0x83,
  CMD_SET_MASTER_MODE: 0xF0,
  CMD_SI_REM: 0xD3,  // Radio punch message
};

class SportIdentReader extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = null;
    this.buffer = Buffer.alloc(0);
    this.isReading = false;
    this.statistics = {
      punchesReceived: 0,
      errors: 0,
      connected: false,
      lastPunch: null,
      startTime: null
    };
    
    // Configuration
    this.config = {
      baudRate: 38400,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoDetect: options.autoDetect !== false,
      portPath: options.portPath || null,
      debug: options.debug || false
    };
  }
  
  /**
   * Auto-detect SRR dongle on available COM ports
   */
  async detectPort() {
    const ports = await SerialPort.list();
    
    // Filter for SportIdent devices (Silicon Labs chip)
    // vendorId: 0x10C4, productId: 0x800A (SI devices) or 0xEA60/0xEA61 (generic CP210x)
    const siPorts = ports.filter(port => 
      port.vendorId === '10C4' && (
        port.productId === '800A' ||  // SPORTident devices
        port.productId === 'EA60' ||  // CP210x USB to UART Bridge
        port.productId === 'EA61' ||  // CP210x USB to UART Bridge
        port.manufacturer?.includes('Silicon Labs') ||
        port.manufacturer?.includes('SPORTident')
      )
    );
    
    if (siPorts.length === 0) {
      throw new Error('No SportIdent device detected. Please connect SRR dongle.');
    }
    
    // If multiple SI devices, probe each to find the SRR dongle
    if (siPorts.length > 1) {
      this.log(`Found ${siPorts.length} SI devices. Probing to identify SRR dongle...`);
      
      for (const portInfo of siPorts) {
        try {
          const isSRR = await this.probeSRRDongle(portInfo.path);
          if (isSRR) {
            this.log(`✓ SRR dongle identified on ${portInfo.path}`);
            return portInfo.path;
          }
        } catch (error) {
          this.log(`✗ ${portInfo.path} is not an SRR dongle`, 'debug');
        }
      }
      
      throw new Error('No SRR dongle found among connected SI devices. Found card reader(s) only.');
    }
    
    return siPorts[0].path;
  }
  
  /**
   * Probe a port to check if it's an SRR dongle (vs card reader)
   * SRR dongles typically have shorter serial numbers (4 digits) vs card readers (6 digits)
   */
  async probeSRRDongle(portPath) {
    const ports = await SerialPort.list();
    const portInfo = ports.find(p => p.path === portPath);
    
    if (!portInfo) {
      return false;
    }
    
    // Heuristic: SRR dongles often have shorter serial numbers than card readers
    // Card readers: typically 6 digits (e.g., 556749)
    // SRR dongles: typically 4 digits (e.g., 5137)
    if (portInfo.serialNumber) {
      const serialLength = portInfo.serialNumber.length;
      this.log(`${portPath}: Serial ${portInfo.serialNumber} (${serialLength} chars)`, 'debug');
      
      // Prefer devices with 4-5 digit serial numbers (likely SRR dongles)
      return serialLength <= 5;
    }
    
    // Fallback: try to communicate with device
    return new Promise((resolve) => {
      const testPort = new SerialPort({
        path: portPath,
        baudRate: 38400,
        autoOpen: false
      });
      
      let responseReceived = false;
      let timeout;
      
      const cleanup = () => {
        clearTimeout(timeout);
        if (testPort.isOpen) {
          testPort.close();
        }
      };
      
      testPort.on('data', (data) => {
        responseReceived = true;
        cleanup();
        resolve(true);
      });
      
      testPort.open((err) => {
        if (err) {
          resolve(false);
          return;
        }
        
        timeout = setTimeout(() => {
          cleanup();
          resolve(responseReceived);
        }, 500);
        
        testPort.write(Buffer.from([SI.WAKEUP]));
      });
    });
  }
  
  /**
   * Connect to SRR dongle
   */
  async connect(portPath = null) {
    try {
      // Close existing connection if any
      if (this.port && this.port.isOpen) {
        await this.disconnect();
      }
      
      // Auto-detect if no port specified
      if (!portPath && this.config.autoDetect) {
        portPath = await this.detectPort();
      }
      
      if (!portPath) {
        throw new Error('No serial port specified');
      }
      
      this.log(`Connecting to ${portPath}...`);
      
      this.port = new SerialPort({
        path: portPath,
        baudRate: this.config.baudRate,
        dataBits: this.config.dataBits,
        stopBits: this.config.stopBits,
        parity: this.config.parity,
        autoOpen: false
      });
      
      // Set up event handlers
      this.port.on('data', (data) => this.handleData(data));
      this.port.on('error', (err) => this.handleError(err));
      this.port.on('close', () => this.handleClose());
      
      // Open port
      await new Promise((resolve, reject) => {
        this.port.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      this.statistics.connected = true;
      this.statistics.startTime = new Date();
      this.log('Connected successfully');
      
      // Initialize dongle
      await this.initialize();
      
      this.emit('connected', { port: portPath });
      return portPath;
      
    } catch (error) {
      this.statistics.connected = false;
      this.log(`Connection failed: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Initialize SRR dongle in listening mode
   */
  async initialize() {
    this.log('Initializing dongle...');
    
    // SRR dongles are typically in mode 11 (wireless receiver)
    // They automatically send punches when received
    // No special initialization needed for passive listening
    
    // Could optionally query system data to verify connection
    // await this.sendCommand(SI.CMD_GET_SYSTEM_VALUE, [0x70, 0x06]);
    
    this.isReading = true;
    this.log('Dongle initialized and listening for punches');
  }
  
  /**
   * Disconnect from dongle
   */
  async disconnect() {
    if (this.port && this.port.isOpen) {
      this.isReading = false;
      await new Promise((resolve) => {
        this.port.close(() => {
          this.statistics.connected = false;
          this.log('Disconnected');
          resolve();
        });
      });
    }
  }
  
  /**
   * Handle incoming serial data
   */
  handleData(data) {
    // Log all incoming data for debugging
    this.log(`Raw data received (${data.length} bytes): ${data.toString('hex')}`, 'debug');
    
    // Append to buffer
    this.buffer = Buffer.concat([this.buffer, data]);
    
    // Process complete messages
    this.processBuffer();
  }
  
  /**
   * Process buffer for complete SI messages
   */
  processBuffer() {
    this.log(`Buffer contains: ${this.buffer.toString('hex')}`, 'debug');
    
    while (this.buffer.length > 0) {
      // Look for STX (start of message)
      const stxIndex = this.buffer.indexOf(SI.STX);
      
      if (stxIndex === -1) {
        // No STX found, discard buffer
        this.log('No STX found, discarding buffer', 'debug');
        this.buffer = Buffer.alloc(0);
        return;
      }
      
      // Discard any data before STX
      if (stxIndex > 0) {
        this.log(`Discarding ${stxIndex} bytes before STX`, 'debug');
        this.buffer = this.buffer.slice(stxIndex);
      }
      
      // Read length from message to calculate expected size
      // Message format: STX CMD LEN [DATA...] CRC CRC ETX
      if (this.buffer.length < 3) {
        this.log('Waiting for CMD and LEN bytes', 'debug');
        return; // Wait for more data
      }
      
      const cmd = this.buffer[1];
      const len = this.buffer[2];
      
      // Expected message size: STX(1) + CMD(1) + LEN(1) + DATA(len) + CRC(2) + ETX(1)
      // But DATA may contain DLE-stuffed bytes, so this is minimum size
      const expectedMinSize = 1 + 1 + 1 + len + 2 + 1;
      
      this.log(`CMD=0x${cmd.toString(16)} LEN=${len} Expected min size=${expectedMinSize} Buffer size=${this.buffer.length}`, 'debug');
      
      if (this.buffer.length < expectedMinSize) {
        this.log('Waiting for more data', 'debug');
        return; // Wait for more data
      }
      
      // Find the last ETX in a reasonable range
      // Look beyond expected size to account for DLE stuffing
      const searchEnd = Math.min(this.buffer.length, expectedMinSize + 20);
      let etxIndex = -1;
      
      for (let i = searchEnd - 1; i >= expectedMinSize - 1; i--) {
        if (this.buffer[i] === SI.ETX) {
          etxIndex = i;
          break;
        }
      }
      
      if (etxIndex === -1) {
        this.log(`No ETX found in range ${expectedMinSize - 1} to ${searchEnd - 1}`, 'debug');
        if (this.buffer.length > 2048) {
          this.log('Buffer overflow, discarding', 'warn');
          this.buffer = Buffer.alloc(0);
        }
        return;
      }
      
      this.log(`Found ETX at index ${etxIndex}`, 'debug');
      
      // Extract complete message
      const message = this.buffer.slice(0, etxIndex + 1);
      this.buffer = this.buffer.slice(etxIndex + 1);
      
      // Process message
      try {
        this.processMessage(message);
      } catch (error) {
        this.log(`Error processing message: ${error.message}`, 'error');
        this.statistics.errors++;
      }
    }
  }
  
  /**
   * Process a complete SI message
   */
  processMessage(message) {
    this.log(`Processing message: ${message.toString('hex')}`, 'debug');
    
    if (message.length < 6) {
      this.log('Message too short', 'debug');
      return;
    }
    
    // Remove STX and ETX
    const data = message.slice(1, -1);
    this.log(`After STX/ETX removal: ${data.toString('hex')}`, 'debug');
    
    // Un-stuff DLE bytes
    const unstuffed = this.unstuffDLE(data);
    this.log(`After unstuffing: ${unstuffed.toString('hex')}`, 'debug');
    
    if (unstuffed.length < 4) {  // CMD + LEN + CRC(2)
      this.log('Unstuffed data too short', 'debug');
      return;
    }
    
    const command = unstuffed[0];
    const length = unstuffed[1];
    // Payload is everything except CMD, LEN, and last 2 bytes (CRC)
    const payload = unstuffed.slice(2, -2);
    
    this.log(`Received: CMD=0x${command.toString(16).padStart(2, '0')} LEN=${length} Payload=${payload.toString('hex')}`, 'debug');
    
    // Process based on command
    switch (command) {
      case SI.CMD_GET_SI5:
      case SI.CMD_GET_SI6:
      case SI.CMD_GET_SI8:
      case SI.CMD_GET_SI9:
      case SI.CMD_GET_PCARD:
      case SI.CMD_SI_REM:  // Radio punch
        this.processPunchData(command, payload);
        break;
      
      case SI.ACK:
        this.log('Received ACK', 'debug');
        break;
        
      default:
        this.log(`Unknown command: 0x${command.toString(16)}`, 'debug');
    }
  }
  
  /**
   * Process punch data from SI message
   * 
   * Radio punches (0xD3) format:
   * Byte 0-2: Card number (3 bytes)
   * Byte 3: Control code high byte
   * Byte 4: Control code low byte  
   * Byte 5-7: Time (3 bytes) - 12h format
   * Byte 8: Day of week (optional)
   */
  processPunchData(command, payload) {
    try {
      this.log(`Processing punch: CMD=0x${command.toString(16)} Payload=${payload.toString('hex')}`, 'debug');
      
      if (payload.length < 6) {
        this.log(`Punch payload too short: ${payload.length} bytes`, 'warn');
        return;
      }
      
      let cardNumber, controlCode, punchTime;
      
      // Parse based on command type
      if (command === SI.CMD_SI_REM) {
        // Radio punch (0xD3) format - based on MeOS SportIdent.cpp decoding
        // Bytes 0-1: Control code (16-bit, big endian)
        controlCode = (payload[0] << 8) | payload[1];
        // Bytes 2: Unknown/padding
        // Bytes 3-5: Card number (24-bit, big endian)
        cardNumber = (payload[3] << 16) | (payload[4] << 8) | payload[5];
        
        // Time decoding (matches MeOS SportIdent.cpp lines 1044-1049):
        // Reference: temp_meos/code/SportIdent.cpp - CMD_SI_REM (0xD3) handler
        // 
        // SI Radio Punch Time Format:
        // Byte 6 bit 0: PM flag (if set, add 12 hours for PM times)
        // Bytes 7-8: Time in seconds since midnight (16-bit, big endian)
        // Byte 9: Subseconds in 1/256 second units
        //
        // MeOS expects: 1/10 second units since midnight (24-hour format)
        // Output: (seconds * 10) + subsecond_tenths + (PM ? 432000 : 0)
        let timeSeconds = (payload[7] << 8) | payload[8]; // Big endian (or payload is in reverse order)
        let timeValue = timeSeconds * 10; // Convert to 1/10 second units
        
        // Add 12 hours if PM
        if (payload[6] & 0x1) {
          timeValue += 12 * 3600 * 10; // 12 hours in 1/10 second units
        }
        
        // Add subseconds if available
        if (payload.length > 9) {
          const subsec = payload[9];
          const tenth = Math.floor(((100 * subsec) / 256 + 4) / 10);
          timeValue += tenth;
        }
        
        punchTime = timeValue;
        
      } else if (command === SI.CMD_GET_SI5) {
        // SI5: 2-byte card number
        cardNumber = (payload[2] << 8) | payload[3];
        controlCode = payload[4];
        punchTime = (payload[5] << 8) | payload[6];
        
      } else {
        // SI6/8/9/10: 3-4 byte card number
        cardNumber = (payload[1] << 16) | (payload[2] << 8) | payload[3];
        controlCode = (payload[4] << 8) | payload[5];
        punchTime = (payload[6] << 16) | (payload[7] << 8) | payload[8];
      }
      
      const punch = {
        cardNumber,
        controlCode,
        punchTime, // SI units (varies by protocol)
        timestamp: new Date(),
        raw: payload.toString('hex')
      };
      
      // Log punch with decoded time
      if (command === SI.CMD_SI_REM) {
        const hours = Math.floor(punchTime / 36000);
        const mins = Math.floor((punchTime % 36000) / 600);
        const secs = Math.floor((punchTime % 600) / 10);
        this.log(`📡 PUNCH: Card=${cardNumber} Control=${controlCode} Time=${punchTime} (${hours}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}) | Raw: [${payload[6].toString(16)} ${payload[7].toString(16)} ${payload[8].toString(16)} ${payload[9] ? payload[9].toString(16) : '--'}]`);
      } else {
        this.log(`📡 PUNCH: Card=${cardNumber} Control=${controlCode} Time=${punchTime}`);
      }
      
      this.statistics.punchesReceived++;
      this.statistics.lastPunch = punch;
      
      this.emit('punch', punch);
      
    } catch (error) {
      this.log(`Error parsing punch: ${error.message}`, 'error');
      this.statistics.errors++;
    }
  }
  
  /**
   * Un-stuff DLE bytes (0x10 0x10 -> 0x10)
   */
  unstuffDLE(data) {
    const result = [];
    let i = 0;
    
    while (i < data.length) {
      if (data[i] === SI.DLE && i + 1 < data.length && data[i + 1] === SI.DLE) {
        result.push(SI.DLE);
        i += 2;
      } else {
        result.push(data[i]);
        i++;
      }
    }
    
    return Buffer.from(result);
  }
  
  /**
   * Stuff DLE bytes (0x10 -> 0x10 0x10)
   */
  stuffDLE(data) {
    const result = [];
    
    for (const byte of data) {
      if (byte === SI.DLE) {
        result.push(SI.DLE, SI.DLE);
      } else {
        result.push(byte);
      }
    }
    
    return Buffer.from(result);
  }
  
  /**
   * Calculate CRC for SI message
   */
  calcCRC(data) {
    if (data.length < 2) return 0;
    
    let crc = (data[0] << 8) + data[1];
    let index = 2;
    
    for (let k = Math.floor(data.length / 2); k > 0; k--) {
      let value;
      
      if (k > 1) {
        value = (data[index] << 8) + data[index + 1];
        index += 2;
      } else {
        value = (data.length & 1) ? (data[index] << 8) : 0;
      }
      
      for (let j = 0; j < 16; j++) {
        if (crc & 0x8000) {
          crc = (crc << 1) & 0xFFFF;
          if (value & 0x8000) crc++;
          crc ^= 0x8005;
        } else {
          crc = (crc << 1) & 0xFFFF;
          if (value & 0x8000) crc++;
        }
        value = (value << 1) & 0xFFFF;
      }
    }
    
    return crc;
  }
  
  /**
   * Send command to dongle (if needed for active mode)
   */
  async sendCommand(command, params = []) {
    if (!this.port || !this.port.isOpen) {
      throw new Error('Port not open');
    }
    
    const data = [command, params.length, ...params];
    const crc = this.calcCRC(Buffer.from(data));
    data.push((crc >> 8) & 0xFF, crc & 0xFF);
    
    const stuffed = this.stuffDLE(Buffer.from(data));
    const message = Buffer.concat([
      Buffer.from([SI.STX]),
      stuffed,
      Buffer.from([SI.ETX])
    ]);
    
    return new Promise((resolve, reject) => {
      this.port.write(message, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  handleError(error) {
    this.log(`Serial port error: ${error.message}`, 'error');
    this.statistics.errors++;
    this.emit('error', error);
  }
  
  handleClose() {
    this.statistics.connected = false;
    this.log('Serial port closed');
    this.emit('disconnected');
  }
  
  getStatistics() {
    return {
      ...this.statistics,
      uptime: this.statistics.startTime ? 
        Math.floor((Date.now() - this.statistics.startTime.getTime()) / 1000) : 0
    };
  }
  
  log(message, level = 'info') {
    const prefix = `[SI Reader]`;
    if (level === 'debug' && !this.config.debug) return;
    
    const colors = {
      info: '\x1b[36m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      debug: '\x1b[90m'
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    
    console.log(`${color}${prefix} ${message}${reset}`);
  }
}

module.exports = SportIdentReader;
