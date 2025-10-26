# MeOS Entry Build - DVOA Event Management System

## Overview

A comprehensive Electron-based desktop application for managing orienteering event operations with MeOS integration. This system provides pre-event setup, same-day registration and check-in, SI card reader integration, runner database management, and live results display.

## Key Features

### 🏃 Event Day Operations
- **Same-Day Registration**: Walk-in runner registration with MeOS integration
- **Check-In System**: Fast check-in with SI card scanning
- **Entry Management**: Edit and manage runner entries before start
- **Rental Card Tracking**: Mark and track rental SI cards with collection reminders
- **Real-time Verification**: Validate entries against MeOS database

### 📊 Live Results Display  
- **Multi-Screen Support**: Display results across 1-4 monitors
- **Medal Highlights**: Gold/silver/bronze backgrounds for top 3 finishers
- **Recent Finisher Alerts**: Bold text for new finishers (within 4 minutes)
- **Checked-In Tracking**: Show runners who checked in but haven't started
- **User Controls**: Configurable refresh rate (10s-60s)
- **Course Information**: Auto-display course lengths and difficulty
- **Time Lost Analysis**: MeOS-based split analysis algorithm

### 🗄️ Runner Database
- **Cloud Sync**: Sync runner database across multiple devices
- **Quick Search**: Fast lookup by name or club
- **Import/Export**: CSV import for bulk updates
- **Historical Data**: Track runner participation history

### 🎯 SI Card Reader Integration
- **Auto-Detection**: Automatic SportIdent reader connection
- **Card Scanning**: Instant card number capture on scan
- **Auto-Assignment**: Match scanned cards to pending entries
- **Serial Port Management**: Handles multiple reader types

### 📋 Pre-Event Setup
- **Event Builder**: Create and configure events from scratch
- **Jotform Integration**: Import pre-registrations from Jotform
- **OE File Import**: Import entries from IOE or CSV formats
- **Course Configuration**: Set up courses and class assignments
- **Export to MeOS**: Generate MeOS-compatible entry files

### 🌐 Network Configuration
- **MySQL Network Setup**: One-click configuration for two-computer setups
- **Automatic Firewall Configuration**: Sets up Windows Firewall rules
- **User Management**: Creates DVOA user with network access permissions
- **IP Address Display**: Shows local IP for connecting other computers
- **[Documentation](docs/MYSQL_NETWORK_SETUP.md)**: Complete setup guide

## Improved Features

### 1. Advanced Fuzzy Matching
- Levenshtein distance algorithm for typo detection
- Jaro-Winkler distance for name similarity scoring
- Configurable similarity thresholds

### 2. Phonetic Matching
- Soundex algorithm for English names
- Double Metaphone for broader phonetic matching
- Handles accent marks and international names

### 3. Enhanced User Interface
- Confidence scoring for matches (0-100%)
- Multiple match suggestions ranked by probability
- Quick approve/reject interface for bulk processing
- Visual diff highlighting for name differences

### 4. Smart Learning System
- Learns from manual corrections
- Builds alias database for future matching
- Common nickname mappings

## Files Structure

```
/improved_matching/
├── php/
│   ├── NameMatcher.php          # Core matching algorithms
│   ├── FuzzyMatchUtils.php      # Fuzzy string matching utilities
│   ├── PhoneticUtils.php        # Phonetic matching algorithms
│   └── DatabaseUtils.php       # Enhanced DB operations
├── js/
│   ├── matching_interface.js    # Interactive UI components
│   └── bulk_processing.js      # Batch processing tools
├── css/
│   └── matching_styles.css     # Enhanced styling
└── sql/
    ├── create_matching_tables.sql  # New database tables
    └── sample_data.sql            # Test data
```

## Installation

1. Copy PHP files to your DVOA admin directory
2. Run the SQL scripts to create new database tables
3. Include the new matching system in your existing workflow
4. Configure similarity thresholds in the config file

## Usage

The enhanced system integrates with the existing result journal workflow but provides much better matching suggestions and a more user-friendly interface for resolving conflicts.

## Testing

Use the provided Hickory Training 25 CSV file to test the improved matching against the existing system.

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      ...tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      ...tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      ...tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
