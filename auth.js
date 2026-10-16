// NSK authentication adapter. Server-side authorization must be enforced by the Worker.
// Existing admin/match flows remain unchanged until the Worker supports user accounts.
(() => {
  // Use the isolated authentication Worker, never the legacy data API for credentials.
  const API = String(window.APP_CONFIG?.AUTH_URL || 'https://nsk-auth-staging.peter-hasselberg.workers.dev').replace(/\/$/, '');
  const KEY = 'nsk_user_token';
  const PERMISSIONS = Object.freeze(['read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','users:manage']);
  let session = null;
  function token() { return sessionStorage.getItem(KEY); }
  function normalize(data) {
    if (!data || !data.user || !Array.isArray(data.permissions)) return null;
    return {
      user: { id: String(data.user.id), name: String(data.user.name || '') },
      memberships: Array.isArray(data.memberships) ? data.memberships : [],
      permissions: data.permissions.filter(p => PERMISSIONS.includes(p))
    };
  }
  async function init() {
    const value = token();
    if (!value) { session = null; return null; }
    try {
      const response = await fetch(API + '/api/auth/me', {
        headers: { Authorization: 'Bearer ' + value }, cache: 'no-store'
      });
      if (!response.ok) { session = null; if (response.status === 401 || response.status === 403) sessionStorage.removeItem(KEY); return null; }
      session = normalize(await response.json());
      if (!session) sessionStorage.removeItem(KEY);
      return session;
    } catch { session = null; return null; }
  }
  function canTeam(teamId, permission) {
    return !!session && session.memberships.some(m => m.team_id === teamId && m.role === 'team_admin') && session.permissions.includes(permission);
  }
  async function checkTeamFeature(teamId, feature) {
    if (!token() || !teamId || !feature) return false;
    const query = new URLSearchParams({ team_id: String(teamId), feature: String(feature) });
    const response = await fetch(API + '/api/auth/feature-access?' + query, {
      headers: { Authorization: 'Bearer ' + token() }, cache: 'no-store', credentials: 'omit'
    });
    if (response.status === 401) { session = null; sessionStorage.removeItem(KEY); return false; }
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data.allowed === true;
  }
  function can(permission) {
    return !!session && session.permissions.includes(permission);
  }
  async function login(email, password) {
    const response = await fetch(API + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) throw new Error(data.error || 'Inloggningen misslyckades');
    sessionStorage.setItem(KEY, data.token);
    const result = await init();
    if (!result) { sessionStorage.removeItem(KEY); throw new Error('Kontot kunde inte verifieras'); }
    return result;
  }
  async function logout() {
    const value = token();
    sessionStorage.removeItem(KEY);
    session = null;
    if (value) {
      try { await fetch(API + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + value } }); }
      catch { /* Local session is always cleared. */ }
    }
  }
  window.Auth = Object.freeze({
    init, login, logout, can, canTeam, checkTeamFeature, getSession: () => session,
    getClient: () => null, getToken: token, permissions: PERMISSIONS
  });
})();
