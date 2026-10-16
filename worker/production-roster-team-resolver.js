/**
 * Trusted Baserow team resolution for the existing /api/spelare and /api/tranare routes.
 * Preparation only: not imported by the deployed production Worker.
 * Never authorize from a team_id submitted by the browser.
 */
export async function resolveLegacyRosterTeam(request, { listTeams, readRow, teamName = 'NSK Team 18', season = '2026' } = {}) {
  if (typeof listTeams !== 'function' || typeof readRow !== 'function') throw new Error('Team resolver not configured');
  const url = new URL(request.url);
  const match = /^\/api\/(spelare|tranare)(?:\/(\d+))?$/.exec(url.pathname);
  if (!match || !['POST', 'PATCH'].includes(request.method) ||
      (request.method === 'POST' && match[2]) || (request.method === 'PATCH' && !match[2])) {
    throw new Error('Unsupported roster route');
  }
  const teams = await listTeams();
  if (!Array.isArray(teams)) throw new Error('Team list unavailable');
  const team = teams.find(t => t?.Namn === teamName && String(t['Säsong']) === season);
  if (!team || !Number.isSafeInteger(Number(team.id)) || Number(team.id) <= 0) throw new Error('Trusted team missing');
  if (request.method === 'PATCH') {
    const row = await readRow(match[1], Number(match[2]));
    if (!row) throw new Error('Roster row missing');
    const links = Array.isArray(row.Lag) ? row.Lag : [];
    const ids = links.map(x => Number(typeof x === 'object' ? x?.id : x));
    if (!ids.includes(Number(team.id))) throw new Error('Roster row belongs to another team');
  }
  return String(team.id);
}
