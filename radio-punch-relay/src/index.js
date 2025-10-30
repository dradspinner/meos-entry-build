/**
 * Radio Punch Relay - Main Entry Point
 * 
 * Connects SportIdent USB dongle to MeOS via MIP protocol
 */

const SportIdentReader = require('./sportident-reader');
const MIPServer = require('./mip-server');
const readline = require('readline');

class RadioPunchRelay {
  constructor() {
    this.siReader = null;
    this.mipServer = null;
    this.running = false;
    
    // Configuration (can be loaded from file)
    this.config = {
      mipPort: 8099,
      competitionId: 0,  // Default to 0 to match MeOS default
      autoConnect: true,
      siPortPath: null, // null = auto-detect
      debug: false
    };
  }
  
  async start() {
    console.log('\n==============================================');
    console.log('  MeOS Radio Punch Relay v1.0');
    console.log('  DVOA Orienteering Timing System');
    console.log('==============================================\n');
    
    try {
      // Initialize MIP server
      console.log('Starting MIP server...');
      this.mipServer = new MIPServer({
        port: this.config.mipPort,
        competitionId: this.config.competitionId
      });
      
      await this.mipServer.start();
      
      // Initialize SI Reader
      console.log('\nConnecting to SportIdent dongle...');
      this.siReader = new SportIdentReader({
        autoDetect: this.config.autoConnect,
        portPath: this.config.siPortPath,
        debug: true  // Enable debug logging to see raw data
      });
      
      // Set up punch handler
      this.siReader.on('punch', (punch) => this.handlePunch(punch));
      this.siReader.on('error', (error) => this.handleError(error));
      this.siReader.on('disconnected', () => this.handleDisconnect());
      
      await this.siReader.connect();
      
      this.running = true;
      
      console.log('\n✅ Radio Punch Relay is RUNNING');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📡 SI Dongle: Connected and listening`);
      console.log(`🌐 MIP Server: http://localhost:${this.config.mipPort}/mip`);
      console.log(`🔢 Competition ID: ${this.config.competitionId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      this.showInstructions();
      this.setupInteractiveCommands();
      
    } catch (error) {
      console.error(`\n❌ Failed to start: ${error.message}`);
      console.error('\nTroubleshooting:');
      console.error('1. Ensure SportIdent SRR dongle is connected via USB');
      console.error('2. Check that Silicon Labs drivers are installed');
      console.error('3. Verify no other software is using the dongle');
      console.error('4. Try running as Administrator\n');
      process.exit(1);
    }
  }
  
  handlePunch(punch) {
    // Add punch to MIP server
    const meosPunch = this.mipServer.addPunch(punch);
    
    // Display punch info
    console.log(`\n📡 PUNCH RECEIVED`);
    console.log(`   Card: ${punch.cardNumber}`);
    console.log(`   Control: ${punch.controlCode}`);
    console.log(`   Time: ${new Date(punch.timestamp).toLocaleTimeString()}`);
    console.log(`   MeOS ID: ${meosPunch.id}`);
    
    if (meosPunch.type) {
      console.log(`   Type: ✨ ${meosPunch.type.toUpperCase()}`);
    }
  }
  
  handleError(error) {
    console.error(`\n⚠️  SI Reader Error: ${error.message}`);
  }
  
  handleDisconnect() {
    console.log('\n⚠️  SI Dongle disconnected!');
    if (this.running) {
      console.log('Type "reconnect" to search for the dongle, or it will auto-retry in 5 seconds...');
      setTimeout(async () => {
        try {
          console.log('Searching all COM ports for SI dongle...');
          const port = await this.siReader.connect();
          console.log(`✅ Reconnected successfully on ${port}`);
        } catch (error) {
          console.error(`❌ Reconnection failed: ${error.message}`);
          console.log('Type "reconnect" to search again.');
        }
      }, 5000);
    }
  }
  
  showInstructions() {
    console.log('📋 NEXT STEPS:');
    console.log('   1. Open MeOS');
    console.log('   2. Go to: Competition → Automatic tasks → Onlineinput');
    console.log(`   3. Set URL: http://localhost:${this.config.mipPort}/mip`);
    console.log(`   4. Set Competition ID: ${this.config.competitionId}`);
    console.log('   5. Set interval: 10-15 seconds (recommended)');
    console.log('   6. Click "Start" in MeOS\n');
    
    console.log('⚙️  CONTROL MAPPINGS:');
    console.log('   Use interactive commands below to map control codes');
    console.log('   Example: "map 31 start" to map control 31 as START\n');
  }
  
  setupInteractiveCommands() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\n> '
    });
    
    console.log('💬 Interactive Commands:');
    console.log('   help                   - Show available commands');
    console.log('   status                 - Show system status');
    console.log('   reconnect              - Search for and reconnect SI dongle');
    console.log('   map <code> <type>      - Map control (e.g., "map 31 start")');
    console.log('   unmap <code>           - Remove mapping');
    console.log('   list                   - List all mappings');
    console.log('   zero <date> <time>     - Set zero time (e.g., "zero 2024-01-15 10:00:00")');
    console.log('   compid <id>            - Set competition ID');
    console.log('   stats                  - Show detailed statistics');
    console.log('   clear                  - Clear all punches');
    console.log('   quit                   - Exit relay\n');
    
    rl.prompt();
    
    rl.on('line', async (line) => {
      const args = line.trim().split(/\s+/);
      const cmd = args[0].toLowerCase();
      
      try {
        switch (cmd) {
          case 'help':
            this.showInstructions();
            break;
            
          case 'status':
            await this.showStatus();
            break;
            
          case 'reconnect':
            console.log('Searching all COM ports for SI dongle...');
            try {
              const port = await this.siReader.connect();
              console.log(`✅ Reconnected successfully on ${port}`);
            } catch (error) {
              console.error(`❌ Reconnection failed: ${error.message}`);
            }
            break;
            
          case 'map':
            if (args.length < 3) {
              console.log('Usage: map <code> <type>');
              console.log('Types: start, finish, check');
            } else {
              const code = parseInt(args[1]);
              const type = args[2].toLowerCase();
              if (['start', 'finish', 'check'].includes(type)) {
                this.mipServer.setControlMapping(code, type);
                console.log(`✅ Mapped control ${code} → ${type}`);
              } else {
                console.log('❌ Invalid type. Use: start, finish, or check');
              }
            }
            break;
            
          case 'unmap':
            if (args.length < 2) {
              console.log('Usage: unmap <code>');
            } else {
              const code = parseInt(args[1]);
              this.mipServer.controlMap.delete(code);
              console.log(`✅ Removed mapping for control ${code}`);
            }
            break;
            
          case 'list':
            this.showMappings();
            break;
            
          case 'zero':
            if (args.length < 3) {
              console.log('Usage: zero <date> <time>');
              console.log('Example: zero 2024-01-15 10:00:00');
            } else {
              this.mipServer.setZeroTime(args[1], args[2]);
              console.log(`✅ Zero time set: ${args[1]} ${args[2]}`);
            }
            break;
            
          case 'compid':
            if (args.length < 2) {
              console.log('Usage: compid <id>');
            } else {
              const id = parseInt(args[1]);
              this.mipServer.setCompetitionId(id);
              this.config.competitionId = id;
              console.log(`✅ Competition ID set to: ${id}`);
            }
            break;
            
          case 'stats':
            await this.showDetailedStats();
            break;
            
          case 'clear':
            const count = this.mipServer.punches.length;
            this.mipServer.punches = [];
            this.mipServer.nextPunchId = 1;
            console.log(`✅ Cleared ${count} punches`);
            break;
            
          case 'quit':
          case 'exit':
            console.log('\nShutting down...');
            await this.stop();
            process.exit(0);
            break;
            
          case '':
            // Empty line, do nothing
            break;
            
          default:
            console.log(`Unknown command: ${cmd}`);
            console.log('Type "help" for available commands');
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
      }
      
      rl.prompt();
    });
    
    rl.on('close', async () => {
      await this.stop();
      process.exit(0);
    });
  }
  
  async showStatus() {
    const siStats = this.siReader.getStatistics();
    const mipStats = this.mipServer.getStatistics();
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SYSTEM STATUS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n📡 SI Dongle:');
    console.log(`   Status: ${siStats.connected ? '✅ Connected' : '❌ Disconnected'}`);
    console.log(`   Punches Received: ${siStats.punchesReceived}`);
    console.log(`   Errors: ${siStats.errors}`);
    console.log(`   Uptime: ${this.formatUptime(siStats.uptime)}`);
    if (siStats.lastPunch) {
      console.log(`   Last Punch: Card ${siStats.lastPunch.cardNumber} @ ${new Date(siStats.lastPunch.timestamp).toLocaleTimeString()}`);
    }
    
    console.log('\n🌐 MIP Server:');
    console.log(`   URL: http://localhost:${this.config.mipPort}/mip`);
    console.log(`   Punches Stored: ${mipStats.punchCount}`);
    console.log(`   Punches Served: ${mipStats.punchesServed}`);
    console.log(`   MeOS Requests: ${mipStats.requests}`);
    console.log(`   Last Request: ${mipStats.lastRequest ? new Date(mipStats.lastRequest).toLocaleTimeString() : 'Never'}`);
    console.log(`   Control Mappings: ${mipStats.mappingCount}`);
    
    console.log('\n⚙️  Configuration:');
    console.log(`   Competition ID: ${this.config.competitionId}`);
    console.log(`   Zero Time: ${this.mipServer.eventDate || 'Not set'} ${this.mipServer.zeroTime || ''}`);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }
  
  async showDetailedStats() {
    await this.showStatus();
    this.showMappings();
  }
  
  showMappings() {
    console.log('\n🗺️  CONTROL MAPPINGS:');
    
    if (this.mipServer.controlMap.size === 0) {
      console.log('   No mappings configured');
      console.log('   Use "map <code> <type>" to add mappings\n');
      return;
    }
    
    const mappings = Array.from(this.mipServer.controlMap.entries())
      .sort((a, b) => a[0] - b[0]);
    
    console.log('   Code  →  Type');
    console.log('   ──────────────');
    mappings.forEach(([code, type]) => {
      const emoji = type === 'start' ? '🏁' : type === 'finish' ? '🎯' : '✅';
      console.log(`   ${emoji} ${code.toString().padStart(3)} →  ${type}`);
    });
    console.log();
  }
  
  formatUptime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  }
  
  async stop() {
    this.running = false;
    
    if (this.siReader) {
      await this.siReader.disconnect();
    }
    
    if (this.mipServer) {
      await this.mipServer.stop();
    }
    
    console.log('✅ Radio Punch Relay stopped\n');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the relay
const relay = new RadioPunchRelay();
relay.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
