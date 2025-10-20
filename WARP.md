# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Development Workflow
```powershell
npm run dev              # Start development server (http://localhost:5173)
npm run build           # Build for production
npm run preview         # Preview production build
```

### Testing
```powershell
npm test                # Run tests in watch mode
npm run test:run        # Run tests once  
npm run test:coverage   # Run with coverage report
npm run test:ui         # Run tests with UI
```

### Code Quality
```powershell
npm run lint            # ESLint checking
```

### Electron Distribution
```powershell
npm run electron:dev    # Run in Electron development mode
npm run electron:build  # Build Electron app
npm run pack:win        # Package for Windows x64
npm run pack:all        # Package for Windows x64 and ia32
```

## Architecture Overview

### Application Structure
This is a **React + TypeScript + Vite** application for managing orienteering event registrations that integrates with the **MeOS** (Meos Orienteering Software) system. The app serves as an intermediary between event day operations and MeOS.

### Core Technology Stack
- **Frontend**: React 18.3.1 + TypeScript + Vite + Ant Design UI
- **Testing**: Vitest + Testing Library + JSDOM
- **Backend Integration**: XML-based MeOS API client (port 2009)
- **Data Storage**: Better-SQLite3 for local hired card inventory
- **Forms**: React Hook Form + Zod validation
- **Build**: Electron for desktop distribution

### Main Application Flow
The app uses a **view-based navigation system** in `src/App.tsx`:
- `dashboard` - Main entry point and system overview
- `eventBuilder` - Pre-event setup and configuration
- `eventDayOps` - Event day operations launcher
- `eventDayDashboard` - Live event day management interface

## Key Components Architecture

### Service Layer (`src/services/`)
- **`meosApi.ts`** - Core MeOS API client with XML parsing and error handling
- **`localEntryService.ts`** - Local entry management and state
- **`meosHiredCardService.ts`** - Rental SI card inventory management  
- **`meosRunnerDatabaseClient.ts`** - Runner database operations
- **`runnerCloudSyncService.ts`** - Cloud synchronization for runner data
- **`sportIdentService.ts`** - SI card reader integration

### Component Hierarchy (`src/components/`)
- **`Dashboard.tsx`** - Main navigation hub
- **`EventBuilder.tsx`** - Pre-event configuration interface
- **`EventDayHome.tsx`** - Event day dashboard and operations
- **`SameDayRegistration.tsx`** - Walk-in registration form
- **`JotformImport.tsx`** - External registration import
- **`CardReaderPanel.tsx`** - SI card reader interface

### Module System (`src/modules/`)
- **`event-builder/`** - Modular event setup functionality
- **`runner-database/`** - Runner database management module

## MeOS Integration Details

### API Connection
- **Base URL**: `http://localhost:2009/meos` (proxied via Vite config)
- **Protocol**: XML-based HTTP requests with custom parsing
- **Error Handling**: Swedish-to-English translation + retry logic
- **Connection Testing**: Built-in connectivity verification

### Data Synchronization
The app implements **bidirectional sync** with MeOS:
- **Import**: JSON backups with automatic MeOS status sync
- **Export**: Local entries to MeOS format
- **Real-time**: Live status updates during events

### Key Integration Points
- **Entry Submission**: Creates runners and entries in MeOS database
- **Status Sync**: Maintains local state synchronized with MeOS
- **Class/Course Import**: Fetches event configuration from MeOS
- **Card Management**: Tracks rental SI cards with MeOS integration

## Development Patterns

### State Management
- Uses React hooks and local state (no global state library)
- **LocalStorage** for persistence of entries and configuration
- **SQLite** for hired card inventory and runner database

### Error Handling
- Comprehensive error boundaries in components
- Service-level error translation (Swedish MeOS errors → English)
- User-friendly error messages with retry mechanisms

### Form Validation
- **Zod schemas** for type-safe validation
- **React Hook Form** for form state management
- Custom validation for MeOS-specific business rules

### Testing Strategy
- **Unit tests** for service layer (`*.test.ts` files)
- **Integration tests** for MeOS API connectivity
- Test utilities in `src/test/setup.ts`

## File Naming Conventions

When creating new files, follow this project's preference:
- Replace hyphens (`-`) with underscores (`_`) in final output filenames
- Example: `new-component.tsx` should become `new_component.tsx`

## Event Day Operations Workflow

### Pre-Event Setup (`EventBuilder`)
1. Import courses/classes from MeOS
2. Configure hired card inventory  
3. Set up runner database
4. Test MeOS connectivity

### Event Day (`EventDayHome`)
1. **Same-day registration** - Walk-in participants
2. **Entry modifications** - Change courses, SI cards, etc.
3. **Card management** - Issue/return rental cards
4. **Real-time sync** - Bidirectional MeOS integration

## Common Development Tasks

### Adding New MeOS API Endpoints
1. Extend interfaces in `src/types/index.ts`
2. Add method to `src/services/meosApi.ts`
3. Include XML parsing logic for MeOS responses
4. Add error handling and retry logic

### Creating New Components
1. Place in appropriate folder (`components/` or `modules/`)
2. Use Ant Design components for consistency
3. Include TypeScript interfaces for props
4. Add error boundaries for robustness

### Adding Form Validation
1. Create Zod schema in component or separate file
2. Use React Hook Form with `@hookform/resolvers`
3. Include MeOS-specific business rule validation
4. Provide clear error messages to users

## Testing MeOS Integration

### Local Testing
1. Ensure MeOS is running on port 2009
2. Use "Test MeOS Sync" buttons in UI
3. Check browser console for detailed logs
4. Test with sample data in `test-data/` folder

### Connection Issues
- MeOS not running: App shows "Disconnected" status (expected)
- Port conflicts: Check Vite proxy configuration
- XML parsing errors: Review `meosApi.ts` parsing logic