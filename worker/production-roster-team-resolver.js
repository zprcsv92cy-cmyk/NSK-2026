/**
 * Trusted Baserow team resolution for the existing /api/spelare and /api/tranare routes.
 * Preparation only: not imported by the deployed production Worker.
 * Never authorize from a team_id submitted by the browser.
 */
export async function resolveLegacyRosterTeam(request, { listTeams, readRow, teamName = 'NSK Team 18', season = '2026', authorizationTeamId } = {}) {
  if (typeof listTeams !== 'function' || typeof readRow !== 'function') throw new Error('Team resolver not configured');
  const url = new URL(request.url);
  const match = /^\/api\/(spelare|tranare)(?:\/(\d+))?$/.exec(url.pathname);
  if (!match || !['POST', 'PATCH', 'DELETE'].includes(request.method) ||
      (request.method === 'POST' && match[2]) || (['PATCH', 'DELETE'].includes(request.method) && !match[2])) {
    throw new Error('Unsupported roster route');
  }
  const teams = await listTeams();
  if (!Array.isArray(teams)) throw new Error('Team list unavailable');
  const matches = teams.filter(t => t?.Namn === teamName && String(t['Säsong']) === season);
  if (matches.length !== 1) throw new Error('Trusted team missing or ambiguous');
  const team = matches[0];
  if (!Number.isSafeInteger(Number(team.id)) || Number(team.id) <= 0 ||
      !/^[1-9]\d*$/.test(String(team.id))) throw new Error('Trusted team missing');
  if (['PATCH', 'DELETE'].includes(request.method)) {
    const rowId = Number(match[2]);
    if (!Number.isSafeInteger(rowId) || rowId <= 0) throw new Error('Invalid roster row ID');
    const row = await readRow(match[1], rowId);
    if (!row) throw new Error('Roster row missing');
    const links = Array.isArray(row.Lag) ? row.Lag : [];
    const ids = links.map(x => Number(typeof x === 'object' ? x?.id : x));
    if (ids.length !== 1 || ids[0] !== Number(team.id))
      throw new Error('Roster row belongs to another team');
  }
  // Reject client-supplied team overrides before the mutation handler runs.
  // Read a clone so the real handler can still consume the request body.
  if (request.body) {
    let body;
    try { body = await request.clone().json(); } catch { throw new Error('Invalid roster JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid roster payload');
    for (const key of ['team_id', 'teamId']) {
      if (Object.prototype.hasOwnProperty.call(body, key) && String(body[key]) !== String(team.id))
        throw new Error('Conflicting team override');
    }
    if (Object.prototype.hasOwnProperty.call(body, 'Lag')) {
      const links = body.Lag;
      if (!Array.isArray(links) || links.length !== 1 ||
          String(typeof links[0] === 'object' ? links[0]?.id : links[0]) !== String(team.id))
        throw new Error('Conflicting roster team links');
    }
  }
  if (authorizationTeamId !== undefined) {
    if (typeof authorizationTeamId !== 'string' || !authorizationTeamId.trim() || authorizationTeamId.length > 100) throw new Error('Invalid trusted team mapping');
    return authorizationTeamId;
  }
  return String(team.id);
}
