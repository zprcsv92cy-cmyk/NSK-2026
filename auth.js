// NSK personal authentication. Enabled only with an explicitly configured AUTH_URL.
// Legacy production admin/match functionality remains unchanged during migration.
(() => {
  const base = String(window.APP_CONFIG?.AUTH_URL || '').replace(/\/$/, '');
  const key = 'nsk_user_token';
  const teamKey = 'nsk_active_team';
  let identity = null;
  const token = () => sessionStorage.getItem(key);
  const clear = () => { identity = null; sessionStorage.removeItem(key); sessionStorage.removeItem(teamKey); };
  async function init() {
    if (!base || !token()) { clear(); return null; }
    try {
      const response = await fetch(base + '/api/auth/me', {
        headers: { Authorization: 'Bearer ' + token() }, cache: 'no-store', credentials: 'omit'
      });
      if (!response.ok) { clear(); return null; }
      const data = await response.json();
      if (!data?.user || !Array.isArray(data.memberships) || !Array.isArray(data.permissions)) {
        clear(); return null;
      }
      identity = data;
      if (!data.memberships.some(m => m.team_id === sessionStorage.getItem(teamKey))) {
        sessionStorage.removeItem(teamKey);
      }
      return identity;
    } catch { identity = null; return null; }
  }
  function activeTeam() {
    const team = sessionStorage.getItem(teamKey);
    return identity?.memberships?.some(m => m.team_id === team) ? team : null;
  }
  function selectTeam(team) {
    if (!identity?.memberships?.some(m => m.team_id === team)) throw new Error('Saknar åtkomst till laget');
    sessionStorage.setItem(teamKey, team);
    return team;
  }
  function can(permission, team = activeTeam()) {
    return !!team && !!identity?.memberships?.some(m => m.team_id === team && (permission === 'read' || m.role === 'team_admin'))
      && (permission === 'read' || identity.permissions.includes(permission));
  }
  async function login(email, password) {
    if (!base) throw new Error('Personlig inloggning är inte aktiverad ännu');
    const response = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) throw new Error(data.error || 'Inloggningen misslyckades');
    clear();
    sessionStorage.setItem(key, data.token);
    const user = await init();
    if (!user) throw new Error('Kontot kunde inte verifieras');
    return user;
  }
  async function logout() {
    const current = token();
    clear();
    if (base && current) {
      try {
        await fetch(base + '/api/auth/logout', {
          method: 'POST', headers: { Authorization: 'Bearer ' + current }, credentials: 'omit'
        });
      } catch { /* Local logout succeeds even if the server is unavailable. */ }
    }
  }
  window.Auth = Object.freeze({
    init, login, logout, can, activeTeam, selectTeam,
    getSession: () => identity, getToken: token, getClient: () => null
  });
})();
