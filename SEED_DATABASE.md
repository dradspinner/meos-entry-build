# Seed Database Setup

## Overview
The application can be bundled with a pre-populated runner database so users start with existing runner data instead of an empty database.

## How to Create and Bundle a Seed Database

### 1. Export Current Database
1. Run the development server: `npm run dev`
2. Navigate to: `http://localhost:5174/export-db.html`
3. Click the "Export Database" button
4. Save the file as `runner_database_seed.db`

### 2. Bundle with Application
1. Copy `runner_database_seed.db` to the `public/` folder
2. Rebuild the application:
   ```bash
   npm run build
   npm run electron:build
   ```

### 3. How It Works
- When a user first opens the application, the SQLite service checks localStorage for existing data
- If no data exists, it attempts to load `/runner_database_seed.db` from the public folder
- The seed database is then saved to localStorage for persistence
- Users can continue to add/edit runners, and the database will grow from the seed data

## Updating the Seed Database
To update the bundled seed database:
1. Make changes to your development database
2. Export again using the export-db.html utility
3. Replace the file in `public/runner_database_seed.db`
4. Rebuild the application

## Notes
- The seed database is only loaded on first run (when localStorage is empty)
- Users' existing data is never overwritten
- The seed file should be kept reasonably small (< 5 MB recommended)
- Large databases may impact initial load time
