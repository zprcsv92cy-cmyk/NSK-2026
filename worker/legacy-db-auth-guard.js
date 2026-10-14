// Staging-only guard for the EXISTING DB adapter. Never loads production data itself.
// The supplied legacyDb is injected by a future isolated test harness.
// Preserve all legacy numeric IDs and shapes; deny before any legacy read.
export function createAuthorizedLegacyDb({ legacyDb, teamId, token, apiBase = '' }) {
  if (!legacyDb || !teamId || !token) throw new Error('Inloggning, lag och datalager krävs');
  const team = String(teamId);
  const guarded = async (method, ...args) => {
    const response = await fetch(apiBase + '/api/auth/integration/access?team_id=' +
      encodeURIComponent(team) + '&feature=roster', {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
    });
    if (!response.ok) throw new Error('Åtkomst nekad');
    const access = await response.json();
    // This access endpoint authorizes roster management, not read access.
    // Membership is checked server-side on each call; the allowed flag
    // only controls edits, and must NOT be required for read-only members.
    if (access.team_id !== team) throw new Error('Fel lag');
    if (typeof legacyDb[method] !== 'function') throw new Error('Funktionen saknas');
    return legacyDb[method](...args);
  };
  return Object.freeze({
    listPlayers: () => guarded('listPlayers'),
    listCoaches: () => guarded('listCoaches'),
    listStaff: role => guarded('listStaff', role),
    // Writes intentionally unavailable until legacy write APIs validate
    // team membership and personal permissions on the server.
  });
}
