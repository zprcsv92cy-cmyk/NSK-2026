import { issueActivationToken } from './account-activation.js';
import { stagingRoster } from './staging-roster.js';
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
  if (!Number.isSafeInteger(iterations) || iterations < 100000 || iterations > 2000000) return false;
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
  // Staging access check for NSK features. Deny by default; personal grants are authoritative.
  if (path === '/api/auth/feature-access' && request.method === 'GET') {
    const actor = await identity(db, request);
    if (!actor) return json({ error: 'Inte inloggad' }, 401);
    const feature = url.searchParams.get('feature');
    const permissions = {
      roster: 'roster:manage',
      pool: 'pool:create',
      lineup: 'lineup:edit',
      shifts: 'shifts:check',
      matches: 'match:manage',
      pool_finish: 'pool:finish',
      pool_reopen: 'pool:reopen',
      users: 'users:manage'
    };
    if (!Object.prototype.hasOwnProperty.call(permissions, feature))
      return json({ error: 'Okänd funktion' }, 400);
    const allowed = actor.permissions.includes(permissions[feature]);
    return json({ feature, allowed, permission: permissions[feature] });
  }
  if (path === '/api/auth/roster-staging' || path.startsWith('/api/auth/roster-staging/')) return stagingRoster(request, db, await identity(db,request), json);
  // Staging-only write gate. No roster records are changed by this probe.
  if (path === '/api/auth/roster-write-check' && request.method === 'POST') {
    const actor = await identity(db, request);
    if (!actor) return json({ error: 'Inte inloggad' }, 401);
    if (!actor.permissions.includes('roster:manage'))
      return json({ error: 'Saknar behörighet att ändra Truppen' }, 403);
    return json({ ok: true, allowed: true, simulated: true });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = bearer(request);
    if (token) await db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE token_hash=? AND revoked_at IS NULL").bind(await sha256(token)).run();
    return json({ ok: true });
  }
  const activationIssue = new RegExp('^/api/auth/users/([a-f0-9-]{36})/setup-token$').exec(path);
  if (activationIssue && request.method === 'POST') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({ error: 'Åtkomst nekad' }, 403);
    const result = await issueActivationToken(db, activationIssue[1]);
    return json(result, result.status || 200);
  }
  // Team membership administration is separate from personal permissions.
  if (path === '/api/auth/team-members' && request.method === 'GET') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({error:'Åtkomst nekad'},403);
    const rows = await db.prepare('SELECT user_id,team_id,role FROM auth_team_memberships ORDER BY team_id,role').all();
    return json({memberships:rows.results||[]});
  }
  if (path === '/api/auth/team-members' && request.method === 'PUT') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({error:'Åtkomst nekad'},403);
    let data; try {data=await request.json();} catch {return json({error:'Ogiltig JSON'},400);}
    const roles=['team_admin','coach','team_manager','fitness','equipment','player','viewer'];
    if (!/^[a-f0-9-]{36}$/.test(data?.user_id||'') || data?.team_id!=='NSK Team 18' || !roles.includes(data?.role))
      return json({error:'Ogiltigt lag, användare eller roll'},400);
    const user=await db.prepare('SELECT id FROM auth_users WHERE id=?').bind(data.user_id).first();
    if (!user) return json({error:'Användaren finns inte'},404);
    await db.prepare('INSERT INTO auth_team_memberships(user_id,team_id,role) VALUES(?,?,?) ON CONFLICT(user_id,team_id) DO UPDATE SET role=excluded.role').bind(data.user_id,data.team_id,data.role).run();
    return json({ok:true});
  }
  // Personal permission administration: only users with users:manage can edit grants.
  if (path === '/api/auth/users' && request.method === 'GET') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({ error: 'Åtkomst nekad' }, 403);
    const users = await db.prepare('SELECT id,email,display_name,disabled FROM auth_users ORDER BY display_name').all();
    const grants = await db.prepare('SELECT user_id,permission FROM auth_user_permissions').all();
    return json({ users: (users.results || []).map(u => ({
      id: u.id, email: u.email, name: u.display_name, disabled: !!u.disabled,
      permissions: (grants.results || []).filter(p => p.user_id === u.id).map(p => p.permission)
    })) });
  }
  const permissionPath = /^\/api\/auth\/users\/([a-f0-9-]{36})\/permissions$/.exec(path);
  if (permissionPath && request.method === 'PUT') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({ error: 'Åtkomst nekad' }, 403);
    let data;
    try { data = await request.json(); } catch { return json({ error: 'Ogiltig JSON' }, 400); }
    const allowed = ['read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','users:manage'];
    if (!Array.isArray(data?.permissions) || data.permissions.some(p => !allowed.includes(p)) ||
        new Set(data.permissions).size !== data.permissions.length) return json({ error: 'Ogiltiga behörigheter' }, 400);
    const target = await db.prepare('SELECT id FROM auth_users WHERE id=?').bind(permissionPath[1]).first();
    if (!target) return json({ error: 'Användaren finns inte' }, 404);
    if (target.id === actor.user.id && !data.permissions.includes('users:manage'))
      return json({ error: 'Du kan inte ta bort din egen användaradministration' }, 400);
    if (!data.permissions.includes('users:manage')) {
      const oldAdmin = await db.prepare("SELECT 1 AS allowed FROM auth_user_permissions WHERE user_id=? AND permission='users:manage'").bind(target.id).first();
      if (oldAdmin) {
        const active = await db.prepare("SELECT count(*) AS n FROM auth_user_permissions p JOIN auth_users u ON u.id=p.user_id WHERE p.permission='users:manage' AND u.disabled=0").first();
        const targetUser = await db.prepare('SELECT disabled FROM auth_users WHERE id=?').bind(target.id).first();
        if (!targetUser.disabled && active.n <= 1)
          return json({ error: 'Sista aktiva administratörens behörighet kan inte tas bort' }, 400);
      }
    }
    const statements = [db.prepare('DELETE FROM auth_user_permissions WHERE user_id=?').bind(target.id),
      ...data.permissions.map(p => db.prepare('INSERT INTO auth_user_permissions(user_id,permission) VALUES(?,?)').bind(target.id,p))];
    await db.batch(statements);
    return json({ ok: true, permissions: data.permissions });
  }
  // Account records are independent of roster entries.
  if (path === '/api/auth/users' && request.method === 'POST') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({ error: 'Åtkomst nekad' }, 403);
    let data;
    try { data = await request.json(); } catch { return json({ error: 'Ogiltig JSON' }, 400); }
    const email = String(data?.email || '').trim().toLowerCase();
    const name = String(data?.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 150)
      return json({ error: 'Ange giltigt namn och e-postadress' }, 400);
    const existing = await db.prepare('SELECT id FROM auth_users WHERE email=?').bind(email).first();
    if (existing) return json({ error: 'E-postadressen används redan' }, 409);
    const id = crypto.randomUUID();
    // Account is disabled until a secure password setup flow is implemented.
    await db.prepare('INSERT INTO auth_users(id,email,display_name,password_hash,disabled) VALUES(?,?,?,?,1)')
      .bind(id,email,name,'pending-setup').run();
    return json({ id, email, name, disabled: true, permissions: [], setup_required: true }, 201);
  }
  const statusPath = /^\/api\/auth\/users\/([a-f0-9-]{36})\/status$/.exec(path);
  if (statusPath && request.method === 'PATCH') {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({error:'Åtkomst nekad'},403);
    let body; try {body=await request.json();} catch {return json({error:'Ogiltig JSON'},400);}
    if (typeof body?.disabled !== 'boolean') return json({error:'Ogiltig status'},400);
    const id=statusPath[1];
    const target=await db.prepare('SELECT id,disabled,password_hash FROM auth_users WHERE id=?').bind(id).first();
    if (!target) return json({error:'Användaren finns inte'},404);
    if (id===actor.user.id && body.disabled) return json({error:'Du kan inte inaktivera dig själv'},400);
    if (!body.disabled && !String(target.password_hash).startsWith('pbkdf2-sha256$'))
      return json({error:'Kontot måste aktiveras med en aktiveringskod först'},409);
    if (body.disabled && !target.disabled) {
      const admin=await db.prepare("SELECT 1 AS allowed FROM auth_user_permissions WHERE user_id=? AND permission='users:manage'").bind(id).first();
      if (admin) {
        const count=await db.prepare("SELECT count(*) AS n FROM auth_user_permissions p JOIN auth_users u ON u.id=p.user_id WHERE p.permission='users:manage' AND u.disabled=0").first();
        if (count.n<=1) return json({error:'Sista aktiva administratören kan inte inaktiveras'},409);
      }
    }
    await db.prepare('UPDATE auth_users SET disabled=? WHERE id=?').bind(body.disabled?1:0,id).run();
    if (body.disabled) await db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL").bind(id).run();
    return json({ok:true,disabled:body.disabled});
  }
  const userPath = /^\/api\/auth\/users\/([a-f0-9-]{36})$/.exec(path);
  if (userPath && (request.method === 'PATCH' || request.method === 'DELETE')) {
    const actor = await requirePersonPermission(request, env, 'users:manage');
    if (!actor) return json({ error: 'Åtkomst nekad' }, 403);
    const id = userPath[1];
    const target = await db.prepare('SELECT id,email,display_name,disabled FROM auth_users WHERE id=?').bind(id).first();
    if (!target) return json({ error: 'Användaren finns inte' }, 404);
    if (request.method === 'DELETE') {
      if (id === actor.user.id) return json({ error: 'Du kan inte ta bort ditt eget konto' }, 400);
      const admin = await db.prepare("SELECT 1 AS allowed FROM auth_user_permissions WHERE user_id=? AND permission='users:manage'").bind(id).first();
      if (admin) {
        const count = await db.prepare("SELECT count(*) AS n FROM auth_user_permissions p JOIN auth_users u ON u.id=p.user_id WHERE p.permission='users:manage' AND u.disabled=0").first();
        if (!target.disabled && count.n <= 1) return json({ error: 'Sista aktiva administratören kan inte tas bort' }, 400);
      }
      await db.batch([
        db.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(id),
        db.prepare('DELETE FROM auth_user_permissions WHERE user_id=?').bind(id),
        db.prepare('DELETE FROM auth_team_memberships WHERE user_id=?').bind(id),
        db.prepare('DELETE FROM auth_users WHERE id=?').bind(id)
      ]);
      return json({ ok: true });
    }
    let data;
    try { data = await request.json(); } catch { return json({ error: 'Ogiltig JSON' }, 400); }
    const email = String(data?.email || '').trim().toLowerCase();
    const name = String(data?.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 150)
      return json({ error: 'Ange giltigt namn och e-postadress' }, 400);
    const conflict = await db.prepare('SELECT id FROM auth_users WHERE email=? AND id<>?').bind(email,id).first();
    if (conflict) return json({ error: 'E-postadressen används redan' }, 409);
    await db.prepare('UPDATE auth_users SET email=?,display_name=? WHERE id=?').bind(email,name,id).run();
    return json({ ok: true, id, email, name });
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
