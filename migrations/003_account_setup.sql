-- Engångslänkar för säker aktivering av konton. Spara endast SHA-256 av token.
CREATE TABLE IF NOT EXISTS auth_setup_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL,
 used_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_setup_tokens_user ON auth_setup_tokens(user_id);
