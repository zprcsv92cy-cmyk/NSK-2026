-- Production personal authentication schema for nsk-api.
-- Apply only to nsk-auth-production, never to staging or Baserow.
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE auth_team_memberships (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','team_admin','coach','team_manager','fitness','equipment','player','viewer')),
  PRIMARY KEY(user_id,team_id)
);
CREATE TABLE auth_user_permissions (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK(permission IN ('read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','users:manage')),
  PRIMARY KEY(user_id,permission)
);
CREATE TABLE auth_setup_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE auth_login_attempts (
  email_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(email_key,window_start)
);
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX auth_memberships_team_idx ON auth_team_memberships(team_id);
