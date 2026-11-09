-- Run as one transactional D1 batch. Preserve every existing personal grant.
-- Matches the permission allowlist in worker/team-auth.js and account-users.js.
CREATE TABLE auth_user_permissions_next (user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,permission TEXT NOT NULL CHECK(permission IN ('read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','photos:manage','users:manage')),PRIMARY KEY(user_id,permission));
INSERT INTO auth_user_permissions_next(user_id,permission) SELECT user_id,permission FROM auth_user_permissions;
DROP TABLE auth_user_permissions;
ALTER TABLE auth_user_permissions_next RENAME TO auth_user_permissions;
