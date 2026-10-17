// NSK personal authentication. Enabled only with an explicitly configured AUTH_URL.
// Legacy production admin/match functionality remains unchanged during migration.
(() => {
  const productionMode = window.APP_CONFIG?.AUTH_MODE === 'production';
  const base = String(productionMode
    ? window.APP_CONFIG?.PRODUCTION_AUTH_URL || ''
    : window.APP_CONFIG?.AUTH_URL || '').replace(/\/$/, '');
  // Personal session keys are environment-specific. Do not ever forward a
  // staging token to production or reuse a production session in staging.
  const key = productionMode ? 'nsk_prod_user_token' : 'nsk_user_token';
  const teamKey = productionMode ? 'nsk_prod_active_team' : 'nsk_active_team';
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
    if (productionMode) throw new Error('Testtruppen är inte tillgänglig i produktion');
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
  // Authenticated and server-scoped real roster reads. No write fallback:
  // the existing real roster mutations remain on the legacy API until its
  // full server-side personal authorization migration is complete.
  async function personalRosterList(team = activeTeam()) {
    if (!productionMode || !base || !token() || !team ||
        !identity?.memberships?.some(m => m.team_id === team)) {
      throw new Error('Produktionsinloggning och valt lag krävs');
    }
    const legacyBase = String(window.APP_CONFIG?.API_URL || '').replace(/\/$/, '');
    const teamResponse = await fetch(legacyBase + '/api/lag?size=200', {
      cache: 'no-store', credentials: 'omit'
    });
    if (!teamResponse.ok) throw new Error('Kunde inte kontrollera lag');
    const teamData = await teamResponse.json();
    const matches = (teamData.results || []).filter(row => row.Namn === team && String(row['Säsong']) === '2026');
    if (matches.length !== 1 || !Number.isSafeInteger(Number(matches[0].id)) ||
        Number(matches[0].id) <= 0) throw new Error('Laget kan inte kopplas till produktionsdata');
    const query = new URLSearchParams({ team_id: String(matches[0].id), size: '200' });
    async function fetchRoster(kind) {
      let all = [], page = 1;
      while (true) {
        query.set('page', String(page));
        const response = await fetch(base + '/api/personal/' + kind + '?' + query, {
          headers: { Authorization: 'Bearer ' + token() },
          credentials: 'omit', cache: 'no-store'
        });
        if (response.status === 401) clear();
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(data.results)) {
          throw new Error(data.error || 'Truppuppgifter kunde inte hämtas');
        }
        all.push(...data.results);
        if (!data.next) return all;
        if (++page > 100) throw new Error('För många sidor i truppsvaret');
      }
    }
    const [players, coaches, staff] = await Promise.all([
      fetchRoster('spelare'), fetchRoster('tranare'), fetchRoster('lagpersonal')
    ]);
    return { team_id: team, players, coaches, staff };
  }
  const stagingRosterList = () => stagingRosterRequest('GET');
  const stagingRosterWrite = (method, rowId, payload) => {
    if (!['POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Otillåten åtgärd');
    return stagingRosterRequest(method, rowId, payload);
  };
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
    init, login, logout, can, checkTeamFeature, stagingRosterList, stagingRosterWrite, personalRosterList, activeTeam, selectTeam,
    getSession: () => identity, getToken: token, getMode: () => productionMode ? 'production' : 'staging', getClient: () => null
  });
})();
