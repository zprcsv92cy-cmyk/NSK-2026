// Production integration boundary for team-scoped roster reads.
// NOT mounted in the deployed nsk-api Worker. Caller must supply trusted dependencies.
const deny = (status, error) => new Response(JSON.stringify({ ok: false, error }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

export async function guardProductionRosterRead(request, {
  verifyIdentity, resolveOwnerTeam, readTeamData
} = {}) {
  if (!(request instanceof Request)) return deny(400, 'Ogiltig begäran');
  const url = new URL(request.url);
  if (request.method !== 'GET') return deny(405, 'Metoden stöds inte');
  if (!/^\/api\/(?:spelare|tranare|lagpersonal)(?:\/\d+)?$/.test(url.pathname)) {
    return deny(404, 'Okänd läsväg');
  }
  if (typeof verifyIdentity !== 'function' ||
      typeof resolveOwnerTeam !== 'function' ||
      typeof readTeamData !== 'function') return deny(503, 'Säker serverkoppling saknas');
  const authorization = request.headers.get('Authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{32,256}$/.test(authorization)) {
    return deny(401, 'Personlig inloggning krävs');
  }
  let actor;
  try { actor = await verifyIdentity(request); }
  catch { return deny(503, 'Sessionen kunde inte verifieras'); }
  if (!actor?.user?.id || !Array.isArray(actor.memberships)) {
    return deny(401, 'Giltig session krävs');
  }

  // Team ownership must come from server-controlled data, never a client-provided team_id.
  // A missing or untrusted owner resolver is rejected below.
  let ownerTeam;
  try { ownerTeam = await resolveOwnerTeam(request); }
  catch { return deny(503, 'Lagtillhörighet kunde inte verifieras'); }
  if (typeof ownerTeam !== 'string' || !ownerTeam.trim() || ownerTeam.length > 100) {
    return deny(503, 'Lagtillhörighet kunde inte verifieras');
  }
  if (!actor.memberships.some(m => m && m.team_id === ownerTeam)) {
    return deny(403, 'Saknar åtkomst till laget');
  }
  // Team membership alone does not grant read access: require an explicit
  // personal read permission from the verified server-side session.
  if (!Array.isArray(actor.permissions) || !actor.permissions.includes('read')) {
    return deny(403, 'Saknar läsbehörighet');
  }
  // Never let a user swap another team into a query parameter after ownership resolution.
  const suppliedTeams = url.searchParams.getAll('team_id');
  const alternateTeams = url.searchParams.getAll('teamId');
  if (alternateTeams.length > 0) return deny(403, 'Fel lag');
  if (suppliedTeams.length > 1 ||
      (suppliedTeams.length === 1 && suppliedTeams[0] !== ownerTeam)) {
    return deny(403, 'Fel lag');
  }
  try {
    const response = await readTeamData(request, ownerTeam, actor);
    if (!(response instanceof Response)) return deny(503, 'Felaktigt serversvar');
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return deny(503, 'Laguppgifter kunde inte hämtas');
  }
}
