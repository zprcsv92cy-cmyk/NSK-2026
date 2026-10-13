-- Personliga behörigheter, frikopplade från lag och trupproller.
-- Kör efter 001_team_auth.sql. Samtliga behörigheter är avstängda som standard.
CREATE TABLE IF NOT EXISTS auth_user_permissions (
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN (
    'read','pool:create','lineup:edit','shifts:check','match:manage',
    'pool:finish','pool:reopen','roster:manage','users:manage'
  )),
  PRIMARY KEY (user_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_auth_user_permissions_permission
  ON auth_user_permissions(permission);

-- Exempelprofil (ej automatiskt kopplad till något konto):
-- read = ja, pool:create = ja, lineup:edit = ja, övriga = nej.
-- INSERT INTO auth_user_permissions(user_id,permission) VALUES
--   ('USER_ID','read'),('USER_ID','pool:create'),('USER_ID','lineup:edit');
