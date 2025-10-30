# Documentation Index

**Quick navigation guide to all MeOS Entry Build documentation.**

## 📚 Table of Contents

- [Getting Started](#getting-started)
- [Core Features](#core-features)
- [Event Day Operations](#event-day-operations)
- [Live Results System](#live-results-system)
- [Runner Database](#runner-database)
- [Hardware Integration](#hardware-integration)
- [Network Setup](#network-setup)
- [Technical Documentation](#technical-documentation)
- [Bug Fixes & Changes](#bug-fixes--changes)
- [Development](#development)

---

## Getting Started

### First-Time Users
- **[README.md](README.md)** - Project overview and quick start
- **[GETTING_STARTED.md](GETTING_STARTED.md)** - Step-by-step setup guide for new users
- **[RUNNING_THE_APP.md](RUNNING_THE_APP.md)** - How to run in Electron vs browser mode
- **[ELECTRON_STARTUP_GUIDE.md](ELECTRON_STARTUP_GUIDE.md)** - Electron-specific startup instructions

### For Developers
- **[DEV_SETUP_COMPLETE.md](DEV_SETUP_COMPLETE.md)** - Development environment setup
- **[WARP.md](WARP.md)** - Development commands, architecture, and coding patterns

---

## Core Features

### Event Building
- **[README.md](README.md#pre-event-setup)** - Event Builder overview
- **[BUGFIX_COURSE_ASSIGNMENT.md](BUGFIX_COURSE_ASSIGNMENT.md)** - Course-to-class assignment fixes

### Entry Management
- **[MULTI_CLASS_FEATURE.md](MULTI_CLASS_FEATURE.md)** - Register runners for multiple classes
- **[README.md](README.md#event-day-operations)** - Same-day registration and check-in

---

## Event Day Operations

### Check-In System
- **[README.md](README.md#event-day-operations)** - Event day operations overview
- **[MULTI_CLASS_FEATURE.md](MULTI_CLASS_FEATURE.md)** - Multi-class check-in workflows

### Tools & Utilities
- **[MENU_ACCESS_GUIDE.md](MENU_ACCESS_GUIDE.md)** - Accessing tools via Electron menu
- **[SQL_RUNNER_CONVERTER.md](SQL_RUNNER_CONVERTER.md)** - Converting legacy SQL databases
- **[SEED_DATABASE.md](SEED_DATABASE.md)** - Bundling seed runner database

---

## Live Results System

### Setup
- **[LIVE_RESULTS_SETUP.md](LIVE_RESULTS_SETUP.md)** - Initial configuration guide
- **[LIVE_RESULTS_README.md](LIVE_RESULTS_README.md)** - Complete live results documentation

### Technical Details
- **[LIVE_RESULTS_IMPROVEMENTS.md](LIVE_RESULTS_IMPROVEMENTS.md)** - Recent enhancements and features
- **[LIVE_RESULTS_API_PROGRESS.md](LIVE_RESULTS_API_PROGRESS.md)** - API-based live results development

---

## Runner Database

### Basic Operations
- **[README.md](README.md#runner-database)** - Runner database overview
- **[SEED_DATABASE.md](SEED_DATABASE.md)** - Creating and bundling seed database

### Import/Export
- **[XML_IMPORT_FEATURE.md](XML_IMPORT_FEATURE.md)** - Importing IOF XML runner data
- **[SQL_RUNNER_CONVERTER.md](SQL_RUNNER_CONVERTER.md)** - Converting SQL database exports
- **[src/services/README.md](src/services/README.md)** - MeOS runner database service

### Cloud Sync
- **[RUNNING_THE_APP.md](RUNNING_THE_APP.md#database-manager-features)** - Cloud sync setup
- **[docs/MEOS_SYNC_FEATURE.md](docs/MEOS_SYNC_FEATURE.md)** - Sync feature documentation

---

## Hardware Integration

### SI Card Readers
- **[SI_READER_TROUBLESHOOTING.md](SI_READER_TROUBLESHOOTING.md)** - Complete troubleshooting guide
- **[ELECTRON_STARTUP_GUIDE.md](ELECTRON_STARTUP_GUIDE.md)** - Fixing Electron card reader issues
- **[README.md](README.md#si-card-reader-integration)** - SI reader integration overview

### Radio Punch System (Optional)
- **[radio-punch-relay/README.md](radio-punch-relay/README.md)** - Radio punch relay documentation
- Setup guide for wireless SI controls and MIP protocol

---

## Network Setup

### MySQL Configuration
- **[docs/MYSQL_NETWORK_SETUP.md](docs/MYSQL_NETWORK_SETUP.md)** - Complete two-computer setup guide
- **[docs/MYSQL_QUICK_REFERENCE.md](docs/MYSQL_QUICK_REFERENCE.md)** - Quick reference card (printable)

### Requirements
- Two-computer setup: Check-in station + Event management
- Automatic firewall configuration
- User and permission management

---

## Technical Documentation

### MeOS Integration
- **[WARP.md](WARP.md#meos-integration-details)** - MeOS API integration architecture
- **[docs/MEOS_SYNC_FEATURE.md](docs/MEOS_SYNC_FEATURE.md)** - JSON import synchronization
- **[docs/MEOS_LOST_TIME_CALCULATION.md](docs/MEOS_LOST_TIME_CALCULATION.md)** - Lost time algorithm

### Architecture
- **[WARP.md](WARP.md#architecture-overview)** - Application architecture
- **[WARP.md](WARP.md#key-components-architecture)** - Service layer and components
- **[README.md](README.md#technology-stack)** - Technology stack overview
- **[README.md](README.md#project-structure)** - Project file structure

---

## Bug Fixes & Changes

### Recent Fixes
- **[BUGFIX_COURSE_ASSIGNMENT.md](BUGFIX_COURSE_ASSIGNMENT.md)** - Course assignment in MeOS XML
- **[docs/LOST_TIME_BUG_FIX.md](docs/LOST_TIME_BUG_FIX.md)** - Lost time display fix
- **[docs/STANDALONE_RESULTS_FIX.md](docs/STANDALONE_RESULTS_FIX.md)** - Standalone live results fix

### Improvements
- **[LIVE_RESULTS_IMPROVEMENTS.md](LIVE_RESULTS_IMPROVEMENTS.md)** - Multi-screen optimization
- Dynamic font sizing and layout
- Nested template literal fixes

---

## Development

### Setup
- **[DEV_SETUP_COMPLETE.md](DEV_SETUP_COMPLETE.md)** - Complete development setup
- **[WARP.md](WARP.md#development-commands)** - Development commands
- **[README.md](README.md#development-commands)** - Quick command reference

### Testing
- **[WARP.md](WARP.md#testing-meos-integration)** - MeOS integration testing
- Test data location: `test-data/` folder

### Coding Standards
- **[WARP.md](WARP.md#file-naming-conventions)** - File naming conventions
- **[WARP.md](WARP.md#development-patterns)** - State management and error handling

---

## Quick Links by Task

### I want to...

**Set up the application for the first time**
→ [GETTING_STARTED.md](GETTING_STARTED.md)

**Run the application**
→ [RUNNING_THE_APP.md](RUNNING_THE_APP.md)

**Set up live results**
→ [LIVE_RESULTS_SETUP.md](LIVE_RESULTS_SETUP.md)

**Fix SI card reader issues**
→ [SI_READER_TROUBLESHOOTING.md](SI_READER_TROUBLESHOOTING.md)

**Configure two-computer setup**
→ [docs/MYSQL_NETWORK_SETUP.md](docs/MYSQL_NETWORK_SETUP.md)

**Import runner data**
→ [XML_IMPORT_FEATURE.md](XML_IMPORT_FEATURE.md)

**Convert SQL database**
→ [SQL_RUNNER_CONVERTER.md](SQL_RUNNER_CONVERTER.md)

**Register runners for multiple classes**
→ [MULTI_CLASS_FEATURE.md](MULTI_CLASS_FEATURE.md)

**Set up radio punches**
→ [radio-punch-relay/README.md](radio-punch-relay/README.md)

**Develop new features**
→ [WARP.md](WARP.md)

---

## Archived Documentation

Historical documentation moved to `archive/` folder:
- `typescript_build_fixes_summary.md` - Build fixes from earlier development
- `test-rollback-functionality.md` - Rollback system testing notes

---

## Support

For additional help:
1. Check the relevant documentation above
2. Review console logs (F12 in browser/Electron)
3. See [WARP.md](WARP.md) for development assistance
4. Contact DVOA technical team

**Last Updated**: 2025-10-30
