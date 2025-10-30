// SQLite Runner Database Service
// Manages runner database using sql.js (pure JavaScript SQLite)

import initSqlJs, { Database } from 'sql.js';
import schema from '../database/schema.sql?raw';

export interface RunnerRecord {
  id: string;
  first_name: string;
  last_name: string;
  birth_year?: number;
  sex?: 'M' | 'F';
  club?: string;
  club_id?: number;
  card_number?: number;
  nationality?: string;
  phone?: string;
  email?: string;
  notes?: string;
  times_used?: number;
  last_used?: string;
  priority_score?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ClubRecord {
  id: number;
  name: string;
  abbreviation?: string;
  country?: string;
  region?: string;
  runner_count?: number;
}

export interface DuplicateCandidate {
  id: number;
  runner_id_1: string;
  runner_id_2: string;
  similarity_score: number;
  match_reason: string;
  reviewed: number;
  action?: string;
  merged_into?: string;
}

class SQLiteRunnerDatabaseService {
  private db: Database | null = null;
  private initialized = false;
  private SQL: any = null;
  private dbPath = 'runner_database.db';

  /**
   * Initialize the database
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize sql.js
      this.SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`
      });

      // Try to load existing database from localStorage
      const savedDb = localStorage.getItem('sqlite_runner_db');
      
      if (savedDb) {
        console.log('[SQLiteDB] Loading existing database from localStorage');
        const buffer = this.base64ToUint8Array(savedDb);
        this.db = new this.SQL.Database(buffer);
      } else {
        console.log('[SQLiteDB] No existing database in localStorage, attempting to load seed...');
        // No saved database - try to load seed database
        const seedLoaded = await this.loadSeedDatabase();
        if (!seedLoaded) {
          console.log('[SQLiteDB] No seed database found, creating empty database');
          // Create empty database
          this.db = new this.SQL.Database();
        }
      }

      // Run schema creation (CREATE IF NOT EXISTS is safe to run multiple times)
      if (this.db) {
        this.db.exec(schema);
        
        // Run migrations to update views
        this.runMigrations();
      }

      this.initialized = true;
      const stats = this.getStats();
      console.log(`[SQLiteDB] ✓ Database initialized with ${stats.totalRunners} runners`);

      // Auto-save every 30 seconds
      setInterval(() => this.saveToLocalStorage(), 30000);

    } catch (error) {
      console.error('[SQLiteDB] Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    if (!this.db) return;

    try {
      // Drop and recreate data_quality_issues view with updated definition
      this.db.exec('DROP VIEW IF EXISTS data_quality_issues');
      this.db.exec(`
        CREATE VIEW data_quality_issues AS
        SELECT 
          id,
          first_name,
          last_name,
          club,
          birth_year,
          sex,
          card_number,
          CASE
            WHEN birth_year IS NULL THEN 'Missing birth year'
            WHEN birth_year < 1920 THEN 'Birth year too old'
            WHEN birth_year > strftime('%Y', 'now') THEN 'Birth year in future'
            WHEN sex IS NULL THEN 'Missing gender'
            ELSE 'Unknown issue'
          END as issue_type
        FROM runners_with_clubs
        WHERE 
          birth_year IS NULL 
          OR birth_year < 1920 
          OR birth_year > strftime('%Y', 'now')
          OR sex IS NULL
      `);
      
      console.log('[SQLiteDB] ✓ Migrations applied');
    } catch (error) {
      console.error('[SQLiteDB] Migration failed:', error);
    }
  }

  /**
   * Ensure database is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
  }

  /**
   * Save database to localStorage
   */
  private saveToLocalStorage(): void {
    if (!this.db) return;

    try {
      const data = this.db.export();
      const base64 = this.uint8ArrayToBase64(data);
      localStorage.setItem('sqlite_runner_db', base64);
    } catch (error) {
      console.error('[SQLiteDB] Failed to save database:', error);
    }
  }

  /**
   * Manually trigger save (for batch operations)
   */
  save(): void {
    this.saveToLocalStorage();
  }

  /**
   * Load seed database from bundled file
   */
  private async loadSeedDatabase(): Promise<boolean> {
    try {
      // Determine the correct path based on environment
      let seedPath = '/runner_database_seed.db';
      
      // In Electron, use relative path from the app's resources
      if (window.location.protocol === 'file:') {
        // Get the base path (removing index.html)
        const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
        seedPath = window.location.origin + basePath + '/runner_database_seed.db';
      }
      
      console.log('[SQLiteDB] Attempting to load seed database from:', seedPath);
      const response = await fetch(seedPath);
      
      if (!response.ok) {
        console.log('[SQLiteDB] No seed database found (status:', response.status, ')');
        return false;
      }

      const arrayBuffer = await response.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      
      this.db = new this.SQL.Database(data);
      console.log('[SQLiteDB] ✓ Loaded seed database');
      
      // Save to localStorage so it persists
      this.saveToLocalStorage();
      
      return true;
    } catch (error) {
      console.log('[SQLiteDB] Failed to load seed database:', error);
      return false;
    }
  }

  /**
   * Export database as Uint8Array (for file save)
   */
  exportDatabase(): Uint8Array {
    this.ensureInitialized();
    return this.db!.export();
  }

  /**
   * Import database from Uint8Array
   */
  importDatabase(data: Uint8Array): void {
    if (!this.SQL) {
      throw new Error('SQL.js not initialized');
    }

    this.db = new this.SQL.Database(data);
    this.initialized = true;
    this.saveToLocalStorage();
  }

  /**
   * Get or create club by name (with alias resolution)
   */
  getOrCreateClub(clubName: string): number {
    this.ensureInitialized();

    if (!clubName || clubName === 'Unknown') {
      return 0; // No club
    }

    const normalizedName = clubName.toLowerCase().trim();

    // Check if this is an alias
    const aliasResult = this.db!.exec(
      'SELECT club_id FROM club_aliases WHERE alias_norm = ?',
      [normalizedName]
    );

    if (aliasResult.length > 0 && aliasResult[0].values.length > 0) {
      return aliasResult[0].values[0][0] as number;
    }

    // Try to find existing club
    const result = this.db!.exec(
      'SELECT id FROM clubs WHERE LOWER(name) = ?',
      [normalizedName]
    );

    if (result.length > 0 && result[0].values.length > 0) {
      return result[0].values[0][0] as number;
    }

    // Create new club
    this.db!.run(
      'INSERT INTO clubs (name) VALUES (?)',
      [clubName]
    );

    // Get the new ID
    const newResult = this.db!.exec('SELECT last_insert_rowid()');
    return newResult[0].values[0][0] as number;
  }

  /**
   * Insert or update runner
   */
  upsertRunner(runner: Partial<RunnerRecord> & { id: string }, skipSave: boolean = false): void {
    this.ensureInitialized();

    // Get or create club
    const clubId = runner.club ? this.getOrCreateClub(runner.club) : null;

    const sql = `
      INSERT INTO runners (
        id, first_name, last_name, birth_year, sex, club_id, 
        card_number, nationality, phone, email, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        birth_year = excluded.birth_year,
        sex = excluded.sex,
        club_id = excluded.club_id,
        card_number = excluded.card_number,
        nationality = excluded.nationality,
        phone = excluded.phone,
        email = excluded.email,
        notes = excluded.notes,
        updated_at = datetime('now')
    `;

    this.db!.run(sql, [
      runner.id,
      runner.first_name || '',
      runner.last_name || '',
      runner.birth_year || null,
      runner.sex || null,
      clubId,
      runner.card_number || null,
      runner.nationality || 'USA',
      runner.phone || null,
      runner.email || null,
      runner.notes || null
    ]);

    // Update or insert stats
    this.updateRunnerStats(runner.id, runner.times_used || 0, runner.last_used);

    if (!skipSave) {
      this.saveToLocalStorage();
    }
  }

  /**
   * Update runner usage statistics
   */
  updateRunnerStats(runnerId: string, timesUsed: number, lastUsed?: string): void {
    this.ensureInitialized();

    const sql = `
      INSERT INTO runner_stats (runner_id, times_used, last_used, priority_score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(runner_id) DO UPDATE SET
        times_used = excluded.times_used,
        last_used = excluded.last_used,
        priority_score = excluded.priority_score
    `;

    const priorityScore = timesUsed * 10 + (lastUsed ? 5 : 0);

    this.db!.run(sql, [
      runnerId,
      timesUsed,
      lastUsed || null,
      priorityScore
    ]);
  }

  /**
   * Get all runners with club info
   */
  getAllRunners(): RunnerRecord[] {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT * FROM runners_with_clubs
      ORDER BY priority_score DESC, last_name, first_name
    `);

    if (result.length === 0) return [];

    return this.resultToObjects(result[0]) as RunnerRecord[];
  }

  /**
   * Search runners by name (uses LIKE for compatibility)
   */
  searchRunners(query: string, limit: number = 50): RunnerRecord[] {
    this.ensureInitialized();

    const searchPattern = `%${query}%`;
    const result = this.db!.exec(`
      SELECT * FROM runners_with_clubs
      WHERE LOWER(first_name) LIKE LOWER(?) 
         OR LOWER(last_name) LIKE LOWER(?)
      ORDER BY priority_score DESC, last_name, first_name
      LIMIT ?
    `, [searchPattern, searchPattern, limit]);

    if (result.length === 0) return [];

    return this.resultToObjects(result[0]) as RunnerRecord[];
  }

  /**
   * Get runners by club
   */
  getRunnersByClub(clubName: string): RunnerRecord[] {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT * FROM runners_with_clubs
      WHERE club = ?
      ORDER BY last_name, first_name
    `, [clubName]);

    if (result.length === 0) return [];

    return this.resultToObjects(result[0]) as RunnerRecord[];
  }

  /**
   * Get runner by ID
   */
  getRunnerById(id: string): RunnerRecord | null {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT * FROM runners_with_clubs WHERE id = ?
    `, [id]);

    if (result.length === 0 || result[0].values.length === 0) return null;

    const runners = this.resultToObjects(result[0]) as RunnerRecord[];
    return runners[0] || null;
  }

  /**
   * Get runner by exact name (fast, case-insensitive)
   */
  getRunnerByExactName(firstName: string, lastName: string): RunnerRecord | null {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT * FROM runners_with_clubs 
      WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?)
      LIMIT 1
    `, [firstName, lastName]);

    if (result.length === 0 || result[0].values.length === 0) return null;

    const runners = this.resultToObjects(result[0]) as RunnerRecord[];
    return runners[0] || null;
  }

  /**
   * Delete runner
   */
  deleteRunner(id: string): void {
    this.ensureInitialized();

    this.db!.run('DELETE FROM runners WHERE id = ?', [id]);
    this.saveToLocalStorage();
  }

  /**
   * Get all clubs with statistics
   */
  getAllClubs(): ClubRecord[] {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT * FROM club_stats
      ORDER BY runner_count DESC, name
    `);

    if (result.length === 0) return [];

    return this.resultToObjects(result[0]) as ClubRecord[];
  }

  /**
   * Get data quality issues
   */
  getDataQualityIssues(): RunnerRecord[] {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT * FROM data_quality_issues
      ORDER BY last_name, first_name
    `);

    if (result.length === 0) return [];

    return this.resultToObjects(result[0]) as RunnerRecord[];
  }

  /**
   * Find potential duplicates using SQL
   */
  findDuplicates(threshold: number = 85): DuplicateCandidate[] {
    this.ensureInitialized();

    // This is a simplified version - you may want to use a more sophisticated algorithm
    // For now, we'll find exact matches or very similar names
    const result = this.db!.exec(`
      SELECT * FROM (
        SELECT 
          r1.id as runner_id_1,
          r2.id as runner_id_2,
          100.0 as similarity_score,
          'Exact name match' as match_reason,
          0 as reviewed,
          NULL as id,
          NULL as action
        FROM runners r1
        JOIN runners r2 ON 
          r1.id < r2.id AND
          LOWER(r1.first_name) = LOWER(r2.first_name) AND
          LOWER(r1.last_name) = LOWER(r2.last_name)
        WHERE NOT EXISTS (
          SELECT 1 FROM duplicate_candidates dc 
          WHERE dc.runner_id_1 = r1.id 
            AND dc.runner_id_2 = r2.id 
            AND dc.action = 'keep_both'
        )
        
        UNION
        
        SELECT 
          r1.id as runner_id_1,
          r2.id as runner_id_2,
          90.0 as similarity_score,
          'Same last name, similar first name, same birth year' as match_reason,
          0 as reviewed,
          NULL as id,
          NULL as action
        FROM runners r1
        JOIN runners r2 ON 
          r1.id < r2.id AND
          r1.last_name = r2.last_name AND
          r1.birth_year = r2.birth_year AND
          r1.birth_year IS NOT NULL AND
          ABS(LENGTH(r1.first_name) - LENGTH(r2.first_name)) <= 2
        WHERE NOT EXISTS (
          SELECT 1 FROM duplicate_candidates dc 
          WHERE dc.runner_id_1 = r1.id 
            AND dc.runner_id_2 = r2.id 
            AND dc.action = 'keep_both'
        )
      ) duplicates
      WHERE similarity_score >= ?
      ORDER BY similarity_score DESC
    `, [threshold]);

    if (result.length === 0) return [];

    return this.resultToObjects(result[0]) as DuplicateCandidate[];
  }

  /**
   * Mark duplicate pair as unique runners (ignore)
   */
  markDuplicateAsUnique(runnerId1: string, runnerId2: string): void {
    this.ensureInitialized();

    // Ensure runner_id_1 < runner_id_2 for consistency
    const [id1, id2] = runnerId1 < runnerId2 ? [runnerId1, runnerId2] : [runnerId2, runnerId1];

    try {
      this.db!.run(
        `INSERT OR REPLACE INTO duplicate_candidates 
         (runner_id_1, runner_id_2, similarity_score, match_reason, reviewed, action) 
         VALUES (?, ?, 0, 'Manually marked as unique', 1, 'keep_both')`,
        [id1, id2]
      );
      this.saveToLocalStorage();
      console.log(`[SQLiteDB] Marked as unique: ${id1} <-> ${id2}`);
    } catch (error) {
      console.error('[SQLiteDB] Failed to mark duplicate as unique:', error);
      throw error;
    }
  }

  /**
   * Find potential club misspellings using Levenshtein distance
   */
  findClubMisspellings(threshold: number = 2): Array<{
    club1: string;
    club2: string;
    distance: number;
    count1: number;
    count2: number;
  }> {
    this.ensureInitialized();

    const clubs = this.getAllClubs();
    const misspellings: Array<{
      club1: string;
      club2: string;
      distance: number;
      count1: number;
      count2: number;
    }> = [];

    // Compare each pair of clubs
    for (let i = 0; i < clubs.length; i++) {
      for (let j = i + 1; j < clubs.length; j++) {
        const club1 = clubs[i];
        const club2 = clubs[j];
        
        // Skip if either is Unknown
        if (club1.name === 'Unknown' || club2.name === 'Unknown') continue;
        
        const distance = this.levenshteinDistance(
          club1.name.toLowerCase(),
          club2.name.toLowerCase()
        );
        
        // For short club names (3-4 chars), be more strict
        const maxLen = Math.max(club1.name.length, club2.name.length);
        const adjustedThreshold = maxLen <= 4 ? 1 : threshold;
        
        if (distance <= adjustedThreshold && distance > 0) {
          misspellings.push({
            club1: club1.name,
            club2: club2.name,
            distance,
            count1: club1.runner_count || 0,
            count2: club2.runner_count || 0,
          });
        }
      }
    }

    // Sort by distance (closest matches first), then by total runner count
    misspellings.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return (b.count1 + b.count2) - (a.count1 + a.count2);
    });

    return misspellings;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[len1][len2];
  }

  /**
   * Add club alias
   */
  addClubAlias(alias: string, canonicalClubName: string): void {
    this.ensureInitialized();

    const clubId = this.getOrCreateClub(canonicalClubName);
    const normalizedAlias = alias.toLowerCase().trim();

    try {
      this.db!.run(
        'INSERT OR REPLACE INTO club_aliases (alias, alias_norm, club_id) VALUES (?, ?, ?)',
        [alias, normalizedAlias, clubId]
      );
      this.saveToLocalStorage();
    } catch (error) {
      console.error('[SQLiteDB] Failed to add club alias:', error);
    }
  }

  /**
   * Get all club aliases
   */
  getClubAliases(): Array<{ alias: string; clubName: string; clubId: number }> {
    this.ensureInitialized();

    const result = this.db!.exec(`
      SELECT ca.alias, c.name as club_name, ca.club_id
      FROM club_aliases ca
      JOIN clubs c ON ca.club_id = c.id
      ORDER BY c.name, ca.alias
    `);

    if (result.length === 0) return [];

    return result[0].values.map(row => ({
      alias: row[0] as string,
      clubName: row[1] as string,
      clubId: row[2] as number
    }));
  }

  /**
   * Delete club alias
   */
  deleteClubAlias(alias: string): void {
    this.ensureInitialized();

    const normalizedAlias = alias.toLowerCase().trim();
    this.db!.run('DELETE FROM club_aliases WHERE alias_norm = ?', [normalizedAlias]);
    this.saveToLocalStorage();
  }

  /**
   * Merge clubs (move all runners from one club to another)
   */
  mergeClubs(fromClubId: number, toClubId: number): void {
    this.ensureInitialized();

    // Update all runners
    this.db!.run(
      'UPDATE runners SET club_id = ? WHERE club_id = ?',
      [toClubId, fromClubId]
    );

    // Move aliases
    this.db!.run(
      'UPDATE club_aliases SET club_id = ? WHERE club_id = ?',
      [toClubId, fromClubId]
    );

    // Delete the old club
    this.db!.run('DELETE FROM clubs WHERE id = ?', [fromClubId]);

    this.saveToLocalStorage();
  }

  /**
   * Rename club
   */
  renameClub(clubId: number, newName: string): void {
    this.ensureInitialized();

    this.db!.run(
      'UPDATE clubs SET name = ?, updated_at = datetime("now") WHERE id = ?',
      [newName, clubId]
    );

    this.saveToLocalStorage();
  }

  /**
   * Get database statistics
   */
  getStats(): { totalRunners: number; totalClubs: number; lastUpdated: Date | null } {
    this.ensureInitialized();

    const runnerCount = this.db!.exec('SELECT COUNT(*) FROM runners');
    const clubCount = this.db!.exec('SELECT COUNT(*) FROM clubs');
    const lastUpdate = this.db!.exec(
      'SELECT MAX(updated_at) FROM runners'
    );

    return {
      totalRunners: (runnerCount[0]?.values[0]?.[0] as number) || 0,
      totalClubs: (clubCount[0]?.values[0]?.[0] as number) || 0,
      lastUpdated: lastUpdate[0]?.values[0]?.[0] 
        ? new Date(lastUpdate[0].values[0][0] as string) 
        : null
    };
  }

  /**
   * Helper: Convert SQL result to objects
   */
  private resultToObjects(result: { columns: string[]; values: any[][] }): any[] {
    return result.values.map(row => {
      const obj: any = {};
      result.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
  }

  /**
   * Helper: Convert Uint8Array to base64
   */
  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Helper: Convert base64 to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Update runner from entry data (called when editing/importing entries)
   */
  updateRunnerFromEntry(
    firstName: string,
    lastName: string,
    birthYear?: number,
    sex?: 'M' | 'F',
    club?: string,
    cardNumber?: number,
    isHiredCard?: boolean
  ): void {
    this.ensureInitialized();

    // Normalize names
    const normalizedFirst = firstName.trim();
    const normalizedLast = lastName.trim();

    // Try to find existing runner by name (with or without birth year)
    let existing: RunnerRecord | null = null;
    
    // First try: exact match with birth year
    if (birthYear) {
      const exactId = `${normalizedLast}_${normalizedFirst}_${birthYear}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      existing = this.getRunnerById(exactId);
    }
    
    // Second try: search by name to find similar entries
    if (!existing) {
      const searchResults = this.searchRunners(`${normalizedFirst} ${normalizedLast}`, 10);
      
      // Look for exact name match (case-insensitive)
      existing = searchResults.find(r => 
        r.first_name.toLowerCase() === normalizedFirst.toLowerCase() &&
        r.last_name.toLowerCase() === normalizedLast.toLowerCase()
      ) || null;
    }

    if (existing) {
      // Update existing runner with new information (don't overwrite with empty values)
      // IMPORTANT: Don't update card number if it's a hired/rental card
      this.upsertRunner({
        id: existing.id,
        first_name: normalizedFirst,
        last_name: normalizedLast,
        birth_year: birthYear || existing.birth_year,
        sex: sex || existing.sex,
        club: club || existing.club,
        card_number: isHiredCard ? existing.card_number : (cardNumber || existing.card_number),
        nationality: existing.nationality,
        times_used: (existing.times_used || 0) + 1,
        last_used: new Date().toISOString(),
      });
    } else {
      // Create new runner with generated ID
      const runnerId = `${normalizedLast}_${normalizedFirst}_${birthYear || 'unknown'}`
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
      
      // IMPORTANT: Don't store card number for hired/rental cards
      this.upsertRunner({
        id: runnerId,
        first_name: normalizedFirst,
        last_name: normalizedLast,
        birth_year: birthYear,
        sex: sex,
        club: club || 'Unknown',
        card_number: isHiredCard ? undefined : cardNumber,
        nationality: 'USA',
        times_used: 1,
        last_used: new Date().toISOString(),
      });
    }
  }

  /**
   * Close and cleanup
   */
  close(): void {
    if (this.db) {
      this.saveToLocalStorage();
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }
}

// Export singleton instance
export const sqliteRunnerDB = new SQLiteRunnerDatabaseService();
export default SQLiteRunnerDatabaseService;
