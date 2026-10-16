/**
 * Verify a personal staging session against D1. Never trust roles or
 * permissions from request JSON or browser storage.
 */
export async function verifyStagingSession(token, env) {
  if (!env?.AUTH_DB || !/^[A-Za-z0-9_-]{32,256}$/.test(token || '')) return null;
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const db = env.AUTH_DB;
  const user = await db.prepare(`SELECT u.id, u.display_name FROM auth_sessions s
    JOIN auth_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL
      AND s.expires_at > datetime('now') AND u.disabled=0`).bind(hash).first();
  if (!user) return null;
  const memberships = await db.prepare(
    'SELECT team_id, role FROM auth_team_memberships WHERE user_id=?'
  ).bind(user.id).all();
  const grants = await db.prepare(
    'SELECT permission FROM auth_user_permissions WHERE user_id=?'
  ).bind(user.id).all();
  return {
    user: { id: user.id, name: user.display_name },
    memberships: memberships.results || [],
    permissions: (grants.results || []).map(row => row.permission)
  };
}
