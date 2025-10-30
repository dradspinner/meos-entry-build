/**
 * MIP (MeOS Input Protocol) Server
 * 
 * Implements the MeOS Input Protocol as defined in onlineinput.cpp
 * Serves punches to MeOS via HTTP/XML polling
 */

const express = require('express');
const xml2js = require('xml2js');
const cors = require('cors');

class MIPServer {
  constructor(options = {}) {
    this.app = express();
    this.port = options.port || 8099;
    this.competitionId = options.competitionId || 0;  // Default to 0 to match MeOS
    this.server = null;
    
    // Punch storage - indexed by ID for incremental delivery
    this.punches = [];
    this.nextPunchId = 1;
    
    // Event zero time (for time calculations - optional)
    this.zeroTime = null;
    this.eventDate = null;
    
    // Control mappings (optional - for control type identification)
    this.controlMap = new Map();
    
    // Statistics
    this.statistics = {
      punchesStored: 0,
      punchesServed: 0,
      requests: 0,
      lastRequest: null,
      startTime: null
    };
    
    this.setupRoutes();
  }
  
  setupRoutes() {
    // Enable CORS
    this.app.use(cors());
    
    // MIP endpoint - MeOS polls this
    // Query params: competition=ID, lastid=LASTID
    this.app.get('/mip', async (req, res) => {
      try {
        this.statistics.requests++;
        this.statistics.lastRequest = new Date();
        
        const competition = parseInt(req.query.competition) || 0;
        const lastId = parseInt(req.query.lastid) || 0;
        
        this.log(`MeOS poll: competition=${competition}, lastid=${lastId}`);
        
        // Verify competition ID
        if (competition !== 0 && competition !== this.competitionId) {
          return res.status(400).send(this.buildErrorXML('Invalid competition ID'));
        }
        
        // Get new punches since lastId
        const newPunches = this.punches.filter(p => p.id > lastId);
        
        this.log(`Serving ${newPunches.length} new punches (${lastId} -> ${this.nextPunchId - 1})`);
        
        // Build MIP XML response
        const xml = this.buildMIPResponse(newPunches);
        
        this.statistics.punchesServed += newPunches.length;
        
        res.set('Content-Type', 'text/xml');
        res.send(xml);
        
      } catch (error) {
        this.log(`Error handling MIP request: ${error.message}`, 'error');
        res.status(500).send(this.buildErrorXML(error.message));
      }
    });
    
    // Configuration endpoints
    this.app.get('/config', (req, res) => {
      res.json({
        competitionId: this.competitionId,
        zeroTime: this.zeroTime,
        eventDate: this.eventDate,
        controlMappings: Array.from(this.controlMap.entries()).map(([code, type]) => ({
          code,
          type
        }))
      });
    });
    
    this.app.post('/config/zerotime', express.json(), (req, res) => {
      const { date, time } = req.body;
      this.eventDate = date;
      this.zeroTime = time;
      this.log(`Zero time set: ${date} ${time}`);
      res.json({ success: true });
    });
    
    this.app.post('/config/mapping', express.json(), (req, res) => {
      const { code, type } = req.body;
      this.controlMap.set(parseInt(code), type);
      this.log(`Control mapping: ${code} -> ${type}`);
      res.json({ success: true });
    });
    
    this.app.delete('/config/mapping/:code', (req, res) => {
      const code = parseInt(req.params.code);
      this.controlMap.delete(code);
      this.log(`Removed mapping for code ${code}`);
      res.json({ success: true });
    });
    
    // Statistics endpoint
    this.app.get('/stats', (req, res) => {
      res.json({
        ...this.statistics,
        uptime: this.statistics.startTime ? 
          Math.floor((Date.now() - this.statistics.startTime.getTime()) / 1000) : 0,
        punchCount: this.punches.length,
        nextId: this.nextPunchId,
        mappingCount: this.controlMap.size
      });
    });
    
    // Clear punches (for testing/reset)
    this.app.post('/clear', (req, res) => {
      const count = this.punches.length;
      this.punches = [];
      this.nextPunchId = 1;
      this.log(`Cleared ${count} punches`);
      res.json({ success: true, cleared: count });
    });
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok',
        server: 'MIP',
        uptime: this.statistics.startTime ? 
          Math.floor((Date.now() - this.statistics.startTime.getTime()) / 1000) : 0
      });
    });
  }
  
  /**
   * Add a punch from the SI reader
   */
  addPunch(punch) {
    // SI reader now provides time in MeOS format (1/10 second units, 24-hour)
    // Just pass it through
    let meosTime = punch.punchTime;
    
    const meosPunch = {
      id: this.nextPunchId++,
      card: punch.cardNumber,
      code: punch.controlCode,
      time: meosTime, // MeOS expects 1/10 second units relative to zero time
      timestamp: punch.timestamp,
      raw: punch.raw
    };
    
    this.punches.push(meosPunch);
    this.statistics.punchesStored++;
    
    // Log detailed time conversion
    const hours = Math.floor(meosTime / 36000);
    const mins = Math.floor((meosTime % 36000) / 600);
    const secs = Math.floor((meosTime % 600) / 10);
    this.log(`Added punch ${meosPunch.id}: Card=${meosPunch.card} Control=${meosPunch.code} SI=${punch.punchTime} MeOS=${meosTime} (${hours}:${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')})`);
    
    return meosPunch;
  }
  
  /**
   * Convert punch time to MeOS format
   * MeOS expects: time in 1/10 second units since midnight
   * SI time is in 1/256 seconds in 12-hour format (wraps at noon)
   * 
   * SI 12-hour format means:
   * - 00:00:00 - 11:59:59 AM is stored as 0 to 43199.xx seconds (0-11.99 hours)
   * - 12:00:00 - 11:59:59 PM is also stored as 0 to 43199.xx seconds
   * We need to detect PM and add 12 hours (43200 seconds)
   */
  convertTimeToMeOS(siTime, timestamp) {
    // Convert SI time (1/256 seconds) to seconds
    let seconds = siTime / 256;
    
    // Debug logging
    const siHours = Math.floor(seconds / 3600);
    const siMins = Math.floor((seconds % 3600) / 60);
    const siSecs = Math.floor(seconds % 60);
    this.log(`SI time debug: ${siTime} / 256 = ${seconds}s = ${siHours}:${siMins.toString().padStart(2,'0')}:${siSecs.toString().padStart(2,'0')}`, 'debug');
    
    if (timestamp) {
      const actualHours = timestamp.getHours();
      this.log(`Actual hour (UTC): ${actualHours}, SI hour: ${siHours}`, 'debug');
      
      // If it's afternoon (12:00-23:59) and SI shows morning hours (0-11)
      // then this is a PM punch, add 12 hours
      if (actualHours >= 12 && siHours < 12) {
        this.log(`Adding 12 hours for PM punch`, 'debug');
        seconds += 12 * 3600; // Add 12 hours (43200 seconds)
      }
    }
    
    // Convert to 1/10 second units for MeOS
    return Math.floor(seconds * 10);
  }
  
  /**
   * Build MIP XML response
   * Format from onlineinput.cpp:
   * <MIPData lastid="X">
   *   <p card="CARD" code="CODE" time="TIME" />
   *   ...
   * </MIPData>
   * 
   * Note: Control type mapping (start/finish/check) is done by MeOS, not here
   */
  buildMIPResponse(punches) {
    const builder = new xml2js.Builder({
      rootName: 'MIPData',
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true }
    });
    
    const data = {
      $: {
        lastid: this.nextPunchId - 1
      },
      p: punches.map(punch => ({
        $: {
          card: punch.card,
          code: punch.code,
          time: punch.time
        }
      }))
    };
    
    return builder.buildObject(data);
  }
  
  buildErrorXML(message) {
    const builder = new xml2js.Builder({
      rootName: 'Error',
      xmldec: { version: '1.0', encoding: 'UTF-8' }
    });
    
    return builder.buildObject({ message });
  }
  
  /**
   * Start MIP server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        this.statistics.startTime = new Date();
        this.log(`MIP server listening on http://localhost:${this.port}/mip`);
        this.log(`Competition ID: ${this.competitionId}`);
        this.log(`Configure MeOS Online Input with: http://localhost:${this.port}/mip`);
        resolve();
      }).on('error', reject);
    });
  }
  
  /**
   * Stop MIP server
   */
  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          this.log('MIP server stopped');
          resolve();
        });
      });
    }
  }
  
  setCompetitionId(id) {
    this.competitionId = id;
    this.log(`Competition ID set to: ${id}`);
  }
  
  setZeroTime(date, time) {
    this.eventDate = date;
    this.zeroTime = time;
    this.log(`Zero time set: ${date} ${time}`);
  }
  
  setControlMapping(code, type) {
    this.controlMap.set(parseInt(code), type);
    this.log(`Control mapping: ${code} -> ${type}`);
  }
  
  clearControlMappings() {
    this.controlMap.clear();
    this.log('Cleared all control mappings');
  }
  
  getStatistics() {
    return {
      ...this.statistics,
      uptime: this.statistics.startTime ? 
        Math.floor((Date.now() - this.statistics.startTime.getTime()) / 1000) : 0,
      punchCount: this.punches.length,
      nextId: this.nextPunchId,
      mappingCount: this.controlMap.size
    };
  }
  
  log(message, level = 'info') {
    const prefix = `[MIP Server]`;
    
    const colors = {
      info: '\x1b[32m',
      warn: '\x1b[33m',
      error: '\x1b[31m',
      debug: '\x1b[90m'
    };
    
    const reset = '\x1b[0m';
    const color = colors[level] || '';
    
    console.log(`${color}${prefix} ${message}${reset}`);
  }
}

module.exports = MIPServer;
