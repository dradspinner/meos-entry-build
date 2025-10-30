# MeOS Entry Build - DVOA Event Management System

**A comprehensive Electron-based desktop application for managing orienteering event operations with MeOS integration.**

## Quick Start

```powershell
npm install              # Install dependencies
npm run electron:dev     # Run application (recommended)
npm run dev              # Run in browser (limited features)
```

📖 **[Full Setup Guide](GETTING_STARTED.md)** | 🚀 **[Running the App](RUNNING_THE_APP.md)** | 📚 **[Documentation Index](DOCS_INDEX.md)** | ⚙️ **[Developer Setup](DEV_SETUP_COMPLETE.md)**

## Core Features

### 🏃 Event Day Operations
- **Same-Day Registration**: Walk-in runner registration with MeOS integration
- **Check-In System**: Fast check-in with SI card scanning
- **Entry Management**: Edit and manage runner entries before start
- **Rental Card Tracking**: Mark and track rental SI cards with collection reminders
- **Multi-Class Support**: Register runners for multiple classes

### 📊 Live Results Display  
- **Multi-Screen Support**: Display results across 1-4 monitors with auto-optimization
- **Medal Highlights**: Gold/silver/bronze backgrounds for top 3 finishers
- **Recent Finisher Alerts**: Bold text for new finishers (within 4 minutes)
- **Checked-In Tracking**: Show runners who checked in but haven't started
- **Time Lost Analysis**: MeOS-based split analysis algorithm
- **[Setup Guide](LIVE_RESULTS_SETUP.md)** | **[Documentation](LIVE_RESULTS_README.md)**

### 🗄️ Runner Database
- **Cloud Sync**: Sync runner database across multiple devices
- **Quick Search**: Fast lookup by name or club
- **Import/Export**: IOF XML 3.0 and CSV import for bulk updates
- **SQL Converter**: Convert legacy SQL database exports to IOF XML
- **Historical Data**: Track runner participation history

### 🎯 SI Card Reader Integration
- **Auto-Detection**: Automatic SportIdent reader connection
- **Card Scanning**: Instant card number capture on scan
- **Auto-Assignment**: Match scanned cards to pending entries
- **[Troubleshooting Guide](SI_READER_TROUBLESHOOTING.md)**

### 📋 Pre-Event Setup
- **Event Builder**: Create and configure events from scratch
- **Jotform Integration**: Import pre-registrations from Jotform
- **IOF/CSV Import**: Import entries from various formats
- **Course Configuration**: Set up courses and class assignments
- **Export to MeOS**: Generate MeOS-compatible entry files

### 🌐 Network Configuration
- **MySQL Network Setup**: One-click configuration for two-computer setups
- **Automatic Firewall Configuration**: Sets up Windows Firewall rules
- **[Setup Guide](docs/MYSQL_NETWORK_SETUP.md)** | **[Quick Reference](docs/MYSQL_QUICK_REFERENCE.md)**

### 📡 Radio Punch Integration (Optional)
- **Real-time Radio Punches**: Receive punches from wireless SI controls
- **MIP Protocol**: Direct integration with MeOS online input
- **[Radio Punch Relay Documentation](radio-punch-relay/README.md)**

## Technology Stack

- **Frontend**: React 18.3 + TypeScript + Vite
- **Desktop**: Electron with native file system access
- **UI Framework**: Ant Design 5
- **Database**: Better-SQLite3 for local storage
- **Testing**: Vitest + Testing Library
- **MeOS Integration**: XML-based API client (port 2009)

## Documentation Index

### Getting Started
- [Getting Started Guide](GETTING_STARTED.md) - First-time setup and overview
- [Running the Application](RUNNING_THE_APP.md) - Electron vs browser mode
- [Development Setup](DEV_SETUP_COMPLETE.md) - Developer environment setup
- [WARP.md](WARP.md) - Development commands and architecture

### Features
- [Multi-Class Feature](MULTI_CLASS_FEATURE.md) - Register runners for multiple classes
- [Live Results Setup](LIVE_RESULTS_SETUP.md) - Configure live results display
- [Live Results Documentation](LIVE_RESULTS_README.md) - Complete live results guide
- [SQL Runner Converter](SQL_RUNNER_CONVERTER.md) - Convert legacy SQL databases
- [XML Import Feature](XML_IMPORT_FEATURE.md) - Import IOF XML runner data

### Troubleshooting
- [SI Reader Troubleshooting](SI_READER_TROUBLESHOOTING.md) - Card reader connection issues
- [Electron Startup Guide](ELECTRON_STARTUP_GUIDE.md) - Electron-specific issues
- [Menu Access Guide](MENU_ACCESS_GUIDE.md) - Finding tools and utilities

### Technical Documentation
- [Live Results Improvements](LIVE_RESULTS_IMPROVEMENTS.md) - Recent enhancements
- [Live Results API Progress](LIVE_RESULTS_API_PROGRESS.md) - API integration notes
- [MeOS Sync Feature](docs/MEOS_SYNC_FEATURE.md) - JSON import synchronization
- [Lost Time Calculation](docs/MEOS_LOST_TIME_CALCULATION.md) - MeOS algorithm details
- [Bug Fixes](docs/LOST_TIME_BUG_FIX.md) - Recent bug fixes

### Network Setup
- [MySQL Network Setup](docs/MYSQL_NETWORK_SETUP.md) - Two-computer configuration
- [MySQL Quick Reference](docs/MYSQL_QUICK_REFERENCE.md) - Quick setup card

## Project Structure

```
meos-entry-build/
├── src/
│   ├── components/         # React UI components
│   ├── services/          # Business logic and API clients
│   ├── modules/           # Feature modules (event-builder, runner-database)
│   ├── types/             # TypeScript type definitions
│   └── test/              # Test setup and utilities
├── public/                # Static assets and standalone HTML
│   ├── live_results.html  # Standalone live results viewer
│   └── server.py          # Python server for XML serving
├── docs/                  # Additional documentation
├── radio-punch-relay/     # Radio punch integration (optional)
└── electron/              # Electron configuration
```

## Development Commands

```powershell
# Development
npm run dev              # Start dev server (browser mode)
npm run electron:dev     # Start Electron app (full features)
npm run build            # Build for production

# Testing
npm test                 # Run tests in watch mode
npm run test:run         # Run tests once
npm run test:coverage    # Generate coverage report

# Code Quality
npm run lint             # Run ESLint

# Distribution
npm run electron:build   # Build Electron app
npm run pack:win         # Package for Windows x64
```

## Contributing

This is a DVOA (Delaware Valley Orienteering Association) project for managing orienteering events.

## License

MIT License - © 2024-2025 DVOA
