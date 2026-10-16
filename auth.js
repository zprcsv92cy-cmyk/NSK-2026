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
    if (!value) { session = null; sessionStorage.removeItem(TEAM_KEY); return null; }
    try {
      const response = await fetch(API + '/api/auth/me', {
        headers: { Authorization: 'Bearer ' + value }, cache: 'no-store'
      });
      if (!response.ok) { session = null; if (response.status === 401 || response.status === 403) sessionStorage.removeItem(KEY); return null; }
      session = normalize(await response.json());
      if (!session) { sessionStorage.removeItem(KEY); sessionStorage.removeItem(TEAM_KEY); }
      else if (!activeTeam()) {
        sessionStorage.removeItem(TEAM_KEY);
        if (session.memberships.length) selectTeam(session.memberships[0].team_id);
      }
      return session;
    } catch { session = null; return null; }
  }
  const TEAM_KEY = 'nsk_active_team';
  function activeTeam() {
    if (!session || !Array.isArray(session.memberships)) return null;
    const selected = sessionStorage.getItem(TEAM_KEY);
    return session.memberships.some(m => m.team_id === selected) ? selected : null;
  }
  function selectTeam(teamId) {
    if (!session || !session.memberships.some(m => m.team_id === teamId)) {
      throw new Error('Du saknar åtkomst till laget');
    }
    sessionStorage.setItem(TEAM_KEY, teamId);
    return teamId;
  }
  function canTeam(teamId, permission) {
    return !!session && session.memberships.some(m => m.team_id === teamId && m.role === 'team_admin') && session.permissions.includes(permission);
  }
  async function checkTeamFeature(teamId, feature) {
    if (!token() || !teamId || !feature) return false;
    const query = new URLSearchParams({ team_id: String(teamId), feature: String(feature) });
    try {
    const response = await fetch(API + '/api/auth/feature-access?' + query, {
      headers: { Authorization: 'Bearer ' + token() }, cache: 'no-store', credentials: 'omit'
    });
    if (response.status === 401) { session = null; sessionStorage.removeItem(KEY); sessionStorage.removeItem(TEAM_KEY); return false; }
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    return data.allowed === true;
    } catch { return false; }
  }
  async function stagingRosterList() {
    const teamId = activeTeam();
    if (!teamId || !token()) throw new Error('Logga in och välj ett lag');
    const query = new URLSearchParams({ team_id: teamId });
    const response = await fetch(API + '/api/auth/roster-staging?' + query, {
      headers: { Authorization: 'Bearer ' + token() },
      cache: 'no-store', credentials: 'omit'
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      session = null; sessionStorage.removeItem(KEY); sessionStorage.removeItem(TEAM_KEY);
    }
    if (!response.ok) throw new Error(data.error || 'Kunde inte hämta testtruppen');
    return data;
  }
  // Staging-only roster writes are authorized again by the Worker.
  // Never fall back to the legacy admin token or production data API.
  async function stagingRosterWrite(method, rowId, payload) {
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Ogiltig metod');
    const teamId = activeTeam();
    if (!teamId || !token()) throw new Error('Logga in och välj ett lag');
    if (!canTeam(teamId, 'roster:manage')) throw new Error('Saknar behörighet till Truppen');
    if (method !== 'POST' && !/^[0-9a-f-]{36}$/i.test(String(rowId || '')))
      throw new Error('Ogiltigt post-ID');
    const path = '/api/auth/roster-staging' + (method === 'POST' ? '' : '/' + encodeURIComponent(rowId));
    const query = new URLSearchParams({ team_id: teamId });
    const response = await fetch(API + path + '?' + query, {
      method, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' },
      ...(method === 'DELETE' ? {} : { body: JSON.stringify(payload || {}) })
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      session = null; sessionStorage.removeItem(KEY); sessionStorage.removeItem(TEAM_KEY);
    }
    if (!response.ok) throw new Error(data.error || 'Kunde inte spara i testmiljön');
    return data;
  }
  // A personal grant alone is never sufficient to edit a team's data.
  // Legacy callers without a team context must not receive write permission.
  function can(permission, teamId) {
    if (!session || !session.permissions.includes(permission)) return false;
    if (permission === 'read') return teamId ? session.memberships.some(m => m.team_id === teamId) : session.memberships.length > 0;
    return typeof teamId === 'string' && canTeam(teamId, permission);
  }
  async function login(email, password) {
    const response = await fetch(API + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) throw new Error(data.error || 'Inloggningen misslyckades');
    sessionStorage.removeItem(TEAM_KEY);
    sessionStorage.setItem(KEY, data.token);
    const result = await init();
    if (!result) { sessionStorage.removeItem(KEY); throw new Error('Kontot kunde inte verifieras'); }
    return result;
  }
  async function logout() {
    const value = token();
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TEAM_KEY);
    session = null;
    if (value) {
      try { await fetch(API + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + value } }); }
      catch { /* Local session is always cleared. */ }
    }
  }
  window.Auth = Object.freeze({
    init, login, logout, can, canTeam, checkTeamFeature, stagingRosterList, stagingRosterWrite, activeTeam, selectTeam, getSession: () => session,
    getClient: () => null, getToken: token, permissions: PERMISSIONS
  });
})();
