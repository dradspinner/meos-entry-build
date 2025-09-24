// Node.js service to read MeOS .wpersons database files
// This should be run as a separate Node.js process to serve runner data via HTTP

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

// MeOS Database structure constants (from RunnerDB.cpp analysis)
const BASE_NAME_LENGTH_UTF = 96;
const RUNNER_DB_ENTRY_SIZE = BASE_NAME_LENGTH_UTF + 4 + 4 + 3 + 1 + 2 + 2 + 8; // 120 bytes

// Known MeOS installation paths
const MEOS_PATHS = [
  'C:\\Program Files\\MeOS41\\database.wpersons',
  'C:\\Program Files\\MeOS40\\database.wpersons', 
  'C:\\Program Files\\MeOS\\database.wpersons',
  'C:\\Program Files (x86)\\MeOS41\\database.wpersons',
  'C:\\Program Files (x86)\\MeOS40\\database.wpersons',
  'C:\\Program Files (x86)\\MeOS\\database.wpersons',
  './database.wpersons'
];

class MeosRunnerDatabaseReader {
  constructor() {
    this.runners = new Map(); // Use Map for better performance
    this.lastModified = null;
    this.filePath = null;
  }

  /**
   * Find and load the MeOS runner database
   */
  async loadDatabase() {
    // Find the database file
    for (const testPath of MEOS_PATHS) {
      try {
        if (fs.existsSync(testPath)) {
          const stats = fs.statSync(testPath);
          
          // Only reload if file has been modified
          if (!this.lastModified || stats.mtime > this.lastModified) {
            console.log(`[MeosDB] Found database at: ${testPath}`);
            console.log(`[MeosDB] File size: ${stats.size} bytes, modified: ${stats.mtime}`);
            
            this.filePath = testPath;
            await this.parseDatabaseFile(testPath);
            this.lastModified = stats.mtime;
            
            return true;
          } else {
            console.log(`[MeosDB] Database file unchanged since last load`);
            return true;
          }
        }
      } catch (error) {
        console.warn(`[MeosDB] Cannot access ${testPath}:`, error.message);
      }
    }
    
    throw new Error('No MeOS database file found in standard locations');
  }

  /**
   * Parse the binary .wpersons file
   */
  async parseDatabaseFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    console.log(`[MeosDB] Reading ${buffer.length} bytes from ${filePath}`);
    
    let offset = 0;
    this.runners.clear();
    
    // Check if file has header (version >= 2)
    if (buffer.length >= 12) {
      const version = buffer.readInt32LE(offset);
      
      if (version === 5460002 || version === 5460003 || version === 5460004) {
        // Has header with version, dataDate, dataTime
        offset += 4;
        const dataDate = buffer.readInt32LE(offset);
        offset += 4;
        const dataTime = buffer.readInt32LE(offset);
        offset += 4;
        
        console.log(`[MeosDB] Database version: ${version}, date: ${dataDate}, time: ${dataTime}`);
      } else {
        // No header, start from beginning
        offset = 0;
      }
    }
    
    // Parse runner entries
    const remainingBytes = buffer.length - offset;
    const entryCount = Math.floor(remainingBytes / RUNNER_DB_ENTRY_SIZE);
    
    console.log(`[MeosDB] Parsing ${entryCount} runner entries...`);
    
    let validRunners = 0;
    
    for (let i = 0; i < entryCount; i++) {
      const entryOffset = offset + (i * RUNNER_DB_ENTRY_SIZE);
      
      try {
        const runner = this.parseRunnerEntry(buffer, entryOffset);
        
        if (runner && !this.isRunnerRemoved(buffer, entryOffset)) {
          const key = `${runner.name.first.toLowerCase()}_${runner.name.last.toLowerCase()}`;
          this.runners.set(key, runner);
          validRunners++;
        }
      } catch (error) {
        console.warn(`[MeosDB] Error parsing entry ${i}:`, error.message);
      }
    }
    
    console.log(`[MeosDB] Successfully loaded ${validRunners} valid runners from database`);
  }

  /**
   * Parse a single runner entry from binary format
   */
  parseRunnerEntry(buffer, offset) {
    // Read name (UTF-8, null-terminated, up to BASE_NAME_LENGTH_UTF bytes)
    const nameBytes = buffer.subarray(offset, offset + BASE_NAME_LENGTH_UTF);
    const nameEndIndex = nameBytes.indexOf(0);
    const nameData = nameBytes.subarray(0, nameEndIndex === -1 ? BASE_NAME_LENGTH_UTF : nameEndIndex);
    const fullName = nameData.toString('utf-8').trim();
    
    if (!fullName) return null;
    
    // Parse name into first/last
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    offset += BASE_NAME_LENGTH_UTF;
    
    // Read other fields
    const cardNo = buffer.readInt32LE(offset);
    offset += 4;
    
    const clubNo = buffer.readInt32LE(offset);
    offset += 4;
    
    // nationality (3 bytes)
    const nationalBytes = buffer.subarray(offset, offset + 3);
    const nationality = nationalBytes.toString('utf-8').replace(/\0/g, '').trim();
    offset += 3;
    
    // sex (1 byte)
    const sexByte = buffer.readUInt8(offset);
    const sex = sexByte === 77 ? 'M' : sexByte === 70 ? 'F' : undefined; // 77='M', 70='F'
    offset += 1;
    
    // birth year (2 bytes)
    const birthYear = buffer.readInt16LE(offset);
    offset += 2;
    
    // reserved (2 bytes) - skip for now
    offset += 2;
    
    // extId (8 bytes)
    const extId = buffer.readBigInt64LE(offset);
    
    return {
      id: extId.toString(),
      name: {
        first: firstName,
        last: lastName
      },
      club: '', // Will need to resolve club name from clubNo separately
      clubNo: clubNo > 0 ? clubNo : undefined,
      birthYear: birthYear > 0 ? birthYear : undefined,
      sex: sex,
      cardNumber: cardNo > 0 ? cardNo : undefined,
      nationality: nationality || undefined,
      extId: extId.toString()
    };
  }

  /**
   * Check if runner entry is marked as removed
   */
  isRunnerRemoved(buffer, offset) {
    try {
      // reserved field is at offset + BASE_NAME_LENGTH_UTF + 4 + 4 + 3 + 1 + 2
      const reservedOffset = offset + BASE_NAME_LENGTH_UTF + 4 + 4 + 3 + 1 + 2;
      const reserved = buffer.readInt16LE(reservedOffset);
      return (reserved & 1) === 1; // Check if bit 0 is set (removed flag)
    } catch (error) {
      return false;
    }
  }

  /**
   * Search runners by name
   */
  searchRunners(searchName, limit = 50) {
    const searchTerm = searchName.toLowerCase().trim();
    if (searchTerm.length < 2) return [];

    const results = [];
    
    for (const runner of this.runners.values()) {
      const fullName = `${runner.name.first} ${runner.name.last}`.toLowerCase();
      const firstNameMatch = runner.name.first.toLowerCase().includes(searchTerm);
      const lastNameMatch = runner.name.last.toLowerCase().includes(searchTerm);
      const fullNameMatch = fullName.includes(searchTerm);
      
      if (firstNameMatch || lastNameMatch || fullNameMatch) {
        // Add relevance score
        let score = 0;
        if (fullName === searchTerm) score += 100;
        else if (fullName.startsWith(searchTerm)) score += 50;
        else if (runner.name.last.toLowerCase().startsWith(searchTerm)) score += 30;
        else if (runner.name.first.toLowerCase().startsWith(searchTerm)) score += 20;
        else score += 10;
        
        results.push({ ...runner, _score: score });
      }
      
      if (results.length >= limit) break;
    }
    
    // Sort by relevance score
    return results.sort((a, b) => b._score - a._score).map(r => {
      const { _score, ...runner } = r;
      return runner;
    });
  }

  /**
   * Get all runners (for bulk export)
   */
  getAllRunners() {
    return Array.from(this.runners.values());
  }

  /**
   * Get database statistics
   */
  getStats() {
    return {
      totalRunners: this.runners.size,
      filePath: this.filePath,
      lastModified: this.lastModified,
      lastChecked: new Date()
    };
  }
}

// Create HTTP server
const app = express();
const PORT = 3001;
const reader = new MeosRunnerDatabaseReader();

// Enable CORS
app.use(cors());
app.use(express.json());

// Middleware to ensure database is loaded
app.use(async (req, res, next) => {
  try {
    await reader.loadDatabase();
    next();
  } catch (error) {
    res.status(503).json({ 
      error: 'Cannot load MeOS runner database',
      details: error.message,
      paths: MEOS_PATHS
    });
  }
});

// API Routes
app.get('/api/runners/search', (req, res) => {
  const { q, limit } = req.query;
  
  if (!q || q.trim().length < 2) {
    return res.json([]);
  }
  
  const results = reader.searchRunners(q, parseInt(limit) || 50);
  res.json(results);
});

app.get('/api/runners/all', (req, res) => {
  const runners = reader.getAllRunners();
  res.json(runners);
});

app.get('/api/runners/stats', (req, res) => {
  const stats = reader.getStats();
  res.json(stats);
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'MeOS Runner Database Reader',
    ...reader.getStats()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[MeosDB] Server running on http://localhost:${PORT}`);
  console.log(`[MeosDB] Available endpoints:`);
  console.log(`  GET /api/runners/search?q=<name>&limit=<number>`);
  console.log(`  GET /api/runners/all`);
  console.log(`  GET /api/runners/stats`);
  console.log(`  GET /health`);
  
  // Initial load
  reader.loadDatabase().catch(error => {
    console.error(`[MeosDB] Failed to load database on startup:`, error.message);
  });
});

module.exports = { MeosRunnerDatabaseReader };