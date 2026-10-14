// Adapter for gradually connecting the EXISTING NSK Truppen page to team auth.
// Not loaded by production. Call only from a protected staging page.
// All mutations must use authenticated staging endpoints; never fall back to legacy admin tokens.
export async function createRosterAuthAdapter({ token, teamId, apiBase = '' }) {
  if (!token || !teamId) throw new Error('Inloggning och lag krävs');
  const headers = { Authorization: 'Bearer ' + token };
  const request = async (path, options = {}) => {
    const response = await fetch(apiBase + path, {
      ...options, headers: { ...headers, ...(options.headers || {}) }, cache: 'no-store'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Åtkomst nekad');
    return body;
  };
  const team = encodeURIComponent(teamId);
  const access = await request('/api/auth/integration/access?team_id=' + team + '&feature=roster');
  const roster = await request('/api/auth/integration/roster?team_id=' + team);
  return Object.freeze({
    teamId,
    canManage: access.allowed === true && roster.canManage === true,
    // Existing Truppen can consume these groups without changing its visual structure.
    players: roster.players,
    coaches: roster.coaches,
    leaders: roster.team_managers,
    fitness: roster.fitness_staff,
    equipment: roster.equipment_staff
  });
}
