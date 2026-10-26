CREATE TABLE IF NOT EXISTS private_skills_pin (
 id INTEGER PRIMARY KEY CHECK(id=1),
 salt TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 locked_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS private_skills_unlocks (
 session_hash TEXT PRIMARY KEY,
 grant_hash TEXT NOT NULL,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS private_skills_unlock_expiry ON private_skills_unlocks(expires_at);
