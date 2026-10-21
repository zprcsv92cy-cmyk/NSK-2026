/**
 * Resolve lagpersonal PATCH ownership using the actual Worker v42 storage model:
 * KV key lagpersonal:team:<numeric team ID>, array rows {id,name,role}.
 * The row ID lives in JSON request body (not in the query string).
 * Rows have no team_id property: membership is established by KV key.
 * Preparation only, not imported by the production Worker.
 */
export async function resolveLagpersonalKvOwnership(request, { listTeams, readTeamStaff } = {}) {
  if (typeof listTeams !== 'function' || typeof readTeamStaff !== 'function')
    throw new Error('Trusted data sources required');
  const url = new URL(request.url);
  if (url.pathname !== '/api/lagpersonal' || !['POST', 'PATCH'].includes(request.method))
    throw new Error('Unsupported route');
  const teamIds = url.searchParams.getAll('team_id');
  if (teamIds.length !== 1) throw new Error('Ambiguous team ID');
  const raw = teamIds[0];
  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))
    throw new Error('Invalid team ID');
  const teams = await listTeams();
  if (!Array.isArray(teams)) throw new Error('Unknown team');
  const matches = teams.filter(t => t && String(t.id) === raw);
  if (matches.length !== 1) throw new Error('Unknown or ambiguous team');
  const trustedTeam = matches[0];
  // Trusted Baserow name is used for membership checks; numeric ID remains the KV key.
  const authorizationTeamId = typeof trustedTeam.Namn === 'string' && trustedTeam.Namn.trim()
    ? trustedTeam.Namn : raw;
  if (authorizationTeamId.length > 100 ||
      teams.filter(t => t && t.Namn === authorizationTeamId).length > 1)
    throw new Error('Ambiguous trusted team name');
  if (request.method === 'POST') return authorizationTeamId;
  let body;
  try { body = await request.clone().json(); } catch { throw new Error('Invalid JSON'); }
  if (!body || typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.id) ||
      typeof body.role !== 'string' || !['Lagledare', 'Fysansvarig', 'Materialförvaltare'].includes(body.role))
    throw new Error('Invalid staff identity');
  const rows = await readTeamStaff(raw);
  if (!Array.isArray(rows) || !rows.some(row => row?.id === body.id && row?.role === body.role))
    throw new Error('Staff not found in trusted team KV');
  return authorizationTeamId;
}
