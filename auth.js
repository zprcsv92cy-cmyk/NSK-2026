// NSK personal authentication. Enabled only with an explicitly configured AUTH_URL.
// Personal permissions control the production UI.
(() => {
  const base = String(window.APP_CONFIG?.AUTH_URL || '').replace(/\/$/, '');
  const key = 'nsk_user_token';
  const teamKey = 'nsk_active_team';
  let identity = null;
  const token = () => sessionStorage.getItem(key);
  const clear = (redirect = true) => { window.NSKViewCache?.clear(); try { sessionStorage.removeItem('nsk_view_cache_v1'); sessionStorage.removeItem('nsk_shell_ui_v1'); } catch {} identity = null; sessionStorage.removeItem(key); sessionStorage.removeItem(teamKey); if(redirect){window.NSKShellHost?.signedOut(); window.NSKAppShell?.signedOut();} };
  let pendingIdentity=null;
  function init() {
    const current=token();
    if(pendingIdentity?.token===current)return pendingIdentity.promise;
    const promise=loadIdentity();
    const entry={token:current,promise};pendingIdentity=entry;
    const clearPending=()=>{if(pendingIdentity===entry)pendingIdentity=null;};
    promise.then(clearPending,clearPending);
    return promise;
  }
  async function loadIdentity() {
    const current=token();
    if (!base || !current) { clear(); return null; }
    try {
      const response = await fetch(base + '/api/auth/me', {
        headers: { Authorization: 'Bearer ' + current }, cache: 'no-store', credentials: 'omit', signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
      });
      if(token()!==current)return null;
      if (!response.ok) { clear(); return null; }
      const data = await response.json();
      if(token()!==current)return null;
      if (!data?.user || !Array.isArray(data.memberships) || !Array.isArray(data.permissions)) {
        clear(); return null;
      }
      identity = data;
      try { localStorage.removeItem('nsk_admin_token'); localStorage.removeItem('nsk_match_token'); } catch {}
      // NSK Team 18 is the only selectable team. Never grant membership implicitly.
      if (data.memberships.some(m => m.team_id === 'NSK Team 18')) {
        sessionStorage.setItem(teamKey, 'NSK Team 18');
      } else {
        sessionStorage.removeItem(teamKey);
      }
      return identity;
    } catch { if(token()===current)identity = null; return null; }
  }
  function activeTeam() {
    return identity?.memberships?.some(m => m.team_id === 'NSK Team 18') ? 'NSK Team 18' : null;
  }
  function selectTeam(team) {
    if (team !== 'NSK Team 18' || !identity?.memberships?.some(m => m.team_id === team))
      throw new Error('Endast NSK Team 18 är tillgängligt');
    sessionStorage.setItem(teamKey, team);
    return team;
  }
  // UI permission names are normalized to the canonical keys stored for each user.
  // This is only a display hint; write operations must still be authorized by the server.
  const permissionKeys = Object.freeze({
    read: 'read',
    pool: 'pool:create',
    lineup: 'lineup:edit',
    shifts: 'shifts:check',
    matches: 'match:manage',
    pool_finish: 'pool:finish',
    pool_reopen: 'pool:reopen',
    roster: 'roster:manage',
    users: 'users:manage'
  });
  function can(permission, team = activeTeam()) {
    const required = permissionKeys[permission] || permission;
    if (!Object.values(permissionKeys).includes(required)) return false;
    if(identity?.is_primary_admin===true&&Object.values(permissionKeys).includes(required))return true;
    const membership = identity?.memberships?.find(m => m && m.team_id === team);
    if (!team || !membership || !Array.isArray(identity?.permissions) ||
        !identity.permissions.includes(required)) return false;
    // Match the server: personal grants apply to staff; viewer memberships stay read-only.
    if (required === 'read') return true;
    return ['owner','team_admin','coach','team_manager','fitness','equipment','player'].includes(membership.role);
  }
  // Confirm each team-specific edit against the server; browser role flags are only UI hints.
  async function checkTeamFeature(feature, team = activeTeam()) {
    if (!base || !token() || !team || !identity?.memberships?.some(m => m.team_id === team)) return false;
    try {
      const query = new URLSearchParams({ team_id: team, feature });
      const response = await fetch(base + '/api/auth/feature-access?' + query, {
        headers: { Authorization: 'Bearer ' + token() },
        credentials: 'omit', cache: 'no-store'
      });
      if (response.status === 401) { clear(); return false; }
      if (!response.ok) return false;
      const result = await response.json();
      return result.allowed === true && result.team_id === team;
    } catch { return false; }
  }
  // Isolated staging roster only. Never sends personal credentials to the legacy production API.
  async function stagingRosterRequest(method, rowId, payload, team = activeTeam()) {
    if (base === 'https://nsk-auth.peter-hasselberg.workers.dev') throw new Error('Testtruppen är inte tillgänglig med produktionsinloggning');
    if (!base || !token() || !team || !identity?.memberships?.some(m => m.team_id === team)) {
      throw new Error('Personlig inloggning och giltigt lag krävs');
    }
    if (method !== 'GET' && !(await checkTeamFeature('roster', team))) {
      throw new Error('Saknar verifierad rätt att ändra truppen');
    }
    const query = new URLSearchParams({ team_id: team });
    const url = base + '/api/auth/roster-staging' + (rowId == null ? '' : '/' + encodeURIComponent(rowId)) + '?' + query;
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: 'Bearer ' + token(), ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }) },
        credentials: 'omit', cache: 'no-store',
        ...(method === 'GET' ? {} : { body: JSON.stringify(payload || {}) })
      });
    } catch { throw new Error('Testservern kunde inte nås'); }
    if (response.status === 401) clear();
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Testservern nekade begäran');
    return data;
  }
  const stagingRosterList = () => stagingRosterRequest('GET');
  const stagingRosterWrite = (method, rowId, payload) => {
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Otillåten åtgärd');
    return stagingRosterRequest(method, rowId, payload);
  };
  async function login(email, password) {
    if (!base) throw new Error('Personlig inloggning är inte aktiverad ännu');
    let response;
    try { response = await fetch(base + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
      body: JSON.stringify({ email, password }),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
    }); } catch(error) {
      if(error?.name==='TimeoutError')throw new Error('Inloggningen tog för lång tid. Kontrollera anslutningen och försök igen.');
      throw error;
    }
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
    clear(false);
    try { localStorage.removeItem('nsk_admin_token'); localStorage.removeItem('nsk_match_token'); } catch {}
    let revocation;
    if (base && current) {
      try {
        revocation=fetch(base + '/api/auth/logout', {
          method: 'POST', headers: { Authorization: 'Bearer ' + current }, credentials: 'omit', keepalive: true,
          signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined
        }).catch(()=>{});
      } catch { /* Local logout succeeds even if the server is unavailable. */ }
    }
    window.NSKShellHost?.signedOut(); window.NSKAppShell?.signedOut();
    await revocation;
  }
  window.Auth = Object.freeze({
    init, login, logout, can, checkTeamFeature, stagingRosterList, stagingRosterWrite, activeTeam, selectTeam,
    getSession: () => identity, getToken: token, getClient: () => null
  });
})();
