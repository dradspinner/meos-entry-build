# DVOA Enhanced Name Matching System

## Overview

This project improves the name matching logic in the DVOA admin system for processing orienteering event results. The current system has basic name matching that often fails with common variations in names, leading to manual intervention for many runner entries.

## Current Issues Identified

From analyzing the existing code and CSV data:

1. **Basic String Matching**: Current system only uses exact string matches with minimal fuzzy logic
2. **Simple Pattern Matching**: Only matches exact last names or first letters
3. **No Fuzzy String Matching**: Cannot handle:
   - Typos (e.g., "Johnston" vs "Johnson") 
   - Different spellings (e.g., "Catherine" vs "Kathryn")
   - Nickname variations (e.g., "Bob" vs "Robert")
   - Accent marks and special characters
4. **No Phonetic Matching**: Cannot match names that sound similar but spelled differently
5. **Poor User Interface**: Manual matching interface is basic and doesn't provide confidence scores

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
