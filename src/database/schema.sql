-- Runner Database Schema for MeOS Entry Build
-- SQLite Database

-- Clubs table
CREATE TABLE IF NOT EXISTS clubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    abbreviation TEXT,
    country TEXT DEFAULT 'USA',
    region TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_clubs_name ON clubs(name);
CREATE INDEX IF NOT EXISTS idx_clubs_abbreviation ON clubs(abbreviation);

-- Club aliases for typo/variant cleanup
CREATE TABLE IF NOT EXISTS club_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias TEXT NOT NULL,
    alias_norm TEXT NOT NULL,
    club_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(alias_norm),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_club_alias_norm ON club_aliases(alias_norm);
CREATE INDEX IF NOT EXISTS idx_club_alias_club_id ON club_aliases(club_id);

-- Runners table (master runner database)
CREATE TABLE IF NOT EXISTS runners (
    id TEXT PRIMARY KEY, -- UUID for compatibility with existing system
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    birth_year INTEGER,
    sex TEXT CHECK(sex IN ('M', 'F')),
    club_id INTEGER,
    card_number INTEGER,
    nationality TEXT DEFAULT 'USA',
    phone TEXT,
    email TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE SET NULL
);

-- Indexes for fast searches
CREATE INDEX IF NOT EXISTS idx_runners_name ON runners(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_runners_club ON runners(club_id);
CREATE INDEX IF NOT EXISTS idx_runners_birth_year ON runners(birth_year);
CREATE INDEX IF NOT EXISTS idx_runners_card ON runners(card_number);
CREATE INDEX IF NOT EXISTS idx_runners_email ON runners(email);

-- Note: FTS5 (Full-Text Search) is not available in sql.js
-- Using standard indexes instead - search will use LIKE queries

-- Runner usage statistics (for autocomplete ranking)
CREATE TABLE IF NOT EXISTS runner_stats (
    runner_id TEXT PRIMARY KEY,
    times_used INTEGER DEFAULT 0,
    last_used TEXT,
    priority_score REAL DEFAULT 0,
    FOREIGN KEY (runner_id) REFERENCES runners(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runner_stats_priority ON runner_stats(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_runner_stats_last_used ON runner_stats(last_used DESC);

-- Duplicate detection cache (pre-computed for speed)
CREATE TABLE IF NOT EXISTS duplicate_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    runner_id_1 TEXT NOT NULL,
    runner_id_2 TEXT NOT NULL,
    similarity_score REAL NOT NULL,
    match_reason TEXT,
    reviewed INTEGER DEFAULT 0, -- 0 = not reviewed, 1 = reviewed
    action TEXT, -- 'keep_both', 'merged', 'deleted'
    merged_into TEXT, -- ID of final runner if merged
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (runner_id_1) REFERENCES runners(id) ON DELETE CASCADE,
    FOREIGN KEY (runner_id_2) REFERENCES runners(id) ON DELETE CASCADE,
    UNIQUE(runner_id_1, runner_id_2)
);

CREATE INDEX IF NOT EXISTS idx_duplicates_score ON duplicate_candidates(similarity_score DESC);
CREATE INDEX IF NOT EXISTS idx_duplicates_reviewed ON duplicate_candidates(reviewed);
CREATE INDEX IF NOT EXISTS idx_duplicates_runner1 ON duplicate_candidates(runner_id_1);
CREATE INDEX IF NOT EXISTS idx_duplicates_runner2 ON duplicate_candidates(runner_id_2);

-- Metadata table for schema version and migrations
CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert initial schema version
INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1.0.0');
INSERT OR IGNORE INTO metadata (key, value) VALUES ('created_at', datetime('now'));

-- Views for common queries

-- View: Runners with club information
CREATE VIEW IF NOT EXISTS runners_with_clubs AS
SELECT 
    r.id,
    r.first_name,
    r.last_name,
    r.birth_year,
    r.sex,
    COALESCE(c.name, 'Unknown') as club,
    c.abbreviation as club_abbr,
    r.card_number,
    r.nationality,
    r.phone,
    r.email,
    r.notes,
    COALESCE(s.times_used, 0) as times_used,
    s.last_used,
    COALESCE(s.priority_score, 0) as priority_score,
    r.created_at,
    r.updated_at
FROM runners r
LEFT JOIN clubs c ON r.club_id = c.id
LEFT JOIN runner_stats s ON r.id = s.runner_id;

-- View: Club statistics
CREATE VIEW IF NOT EXISTS club_stats AS
SELECT 
    c.id,
    c.name,
    c.abbreviation,
    COUNT(r.id) as runner_count,
    COUNT(CASE WHEN r.sex = 'M' THEN 1 END) as male_count,
    COUNT(CASE WHEN r.sex = 'F' THEN 1 END) as female_count,
    AVG(CASE WHEN r.birth_year IS NOT NULL THEN r.birth_year END) as avg_birth_year
FROM clubs c
LEFT JOIN runners r ON c.id = r.club_id
GROUP BY c.id, c.name, c.abbreviation;

-- View: Data quality issues
CREATE VIEW IF NOT EXISTS data_quality_issues AS
SELECT 
    id,
    first_name,
    last_name,
    club,
    birth_year,
    sex,
    CASE
        WHEN birth_year IS NULL THEN 'Missing birth year'
        WHEN birth_year < 1920 THEN 'Birth year too old'
        WHEN birth_year > strftime('%Y', 'now') THEN 'Birth year in future'
        WHEN sex IS NULL THEN 'Missing gender'
        WHEN club IS NULL OR club = 'Unknown' THEN 'Missing club'
        WHEN length(first_name) <= 1 THEN 'First name too short'
        WHEN length(last_name) <= 1 THEN 'Last name too short'
        ELSE 'Unknown issue'
    END as issue_type
FROM runners_with_clubs
WHERE 
    birth_year IS NULL 
    OR birth_year < 1920 
    OR birth_year > strftime('%Y', 'now')
    OR sex IS NULL
    OR club IS NULL 
    OR club = 'Unknown'
    OR length(first_name) <= 1
    OR length(last_name) <= 1;
