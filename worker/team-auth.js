// Cloudflare Worker module. Mount under /api/auth/* after configuring AUTH_DB D1.
// Existing nsk-api routes must continue to use their current handler until migrated.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const encode = value => new TextEncoder().encode(value);
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
async function sha256(value) { return hex(await crypto.subtle.digest('SHA-256', encode(value))); }
function bearer(request) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization') || '');
  return match ? match[1] : null;
}
function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function verifyPassword(password, stored) {
  // Format: pbkdf2-sha256$iterations$hexSalt$hexDerivedKey
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2-sha256') return false;
  const iterations = Number(parts[1]);
  if (!Number.isSafeInteger(iterations) || iterations < 600000 || iterations > 2000000) return false;
  const salt = parts[2], expected = parts[3];
  if (!/^[a-f0-9]{32,128}$/.test(salt) || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const key = await crypto.subtle.importKey('raw', encode(password), 'PBKDF2', false, ['deriveBits']);
  const saltBytes = new Uint8Array(salt.match(/../g).map(h => parseInt(h, 16)));
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' }, key, 256));
  const target = new Uint8Array(expected.match(/../g).map(h => parseInt(h, 16)));
  let difference = 0;
  for (let i = 0; i < derived.length; i++) difference |= derived[i] ^ target[i];
  return difference === 0;
}
async function identity(db, request) {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256(token);
  const user = await db.prepare(`SELECT u.id, u.display_name FROM auth_sessions s
    JOIN auth_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > datetime('now') AND u.disabled=0`)
    .bind(hash).first();
  if (!user) return null;
  const memberships = await db.prepare('SELECT team_id, role FROM auth_team_memberships WHERE user_id=?').bind(user.id).all();
  const grants = await db.prepare('SELECT permission FROM auth_user_permissions WHERE user_id=?').bind(user.id).all();
  return { user: { id: user.id, name: user.display_name }, memberships: memberships.results || [], permissions: (grants.results || []).map(row => row.permission) };
}
export async function handleTeamAuth(request, env) {
  if (!env.AUTH_DB) return json({ error: 'Autentisering är inte konfigurerad' }, 503);
  const url = new URL(request.url), path = url.pathname, db = env.AUTH_DB;
  if (path === '/api/auth/login' && request.method === 'POST') {
    let data;
    try { data = await request.json(); } catch { return json({ error: 'Ogiltig JSON' }, 400); }
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    if (!email || email.length > 254 || !password || password.length > 1024) return json({ error: 'Fel e-postadress eller lösenord' }, 401);
    const user = await db.prepare('SELECT id,password_hash,disabled FROM auth_users WHERE email=?').bind(email).first();
    if (!user || user.disabled || !(await verifyPassword(password, user.password_hash))) return json({ error: 'Fel e-postadress eller lösenord' }, 401);
    const token = newToken(), hash = await sha256(token);
    await db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+12 hours'))").bind(hash, user.id).run();
    return json({ token });
  }
  if (path === '/api/auth/me' && request.method === 'GET') {
    const user = await identity(db, request);
    return user ? json(user) : json({ error: 'Inte inloggad' }, 401);
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = bearer(request);
    if (token) await db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE token_hash=? AND revoked_at IS NULL").bind(await sha256(token)).run();
    return json({ ok: true });
  }
  return json({ error: 'Okänd autentiseringsadress' }, 404);
}
// Authorization is assigned to a person, never derived from a team or roster role.
export async function requirePersonPermission(request, env, permission) {
  if (!env.AUTH_DB) return null;
  const person = await identity(env.AUTH_DB, request);
  return person?.permissions.includes(permission) ? person : null;
}

// Legacy signature retained for callers; teamId does not grant rights.
export async function requireTeamPermission(request, env, teamId, permission) {
  return requirePersonPermission(request, env, permission);
}
