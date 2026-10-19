import { authorizeTeamFeature } from './team-authorization-policy.js';
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';

/** Server-side identity and ownership guard for match configuration and lineups. */
export async function authorizePersonalMatchWrite(request, env, {
  listTeams,
  readPool,
  readMatchConfig,
  verifyIdentity = token => createPersonalRosterIdentityVerifier(env)(token)
} = {}) {
  const deny = (status, error) => ({ allowed: false, status, error });
  if (!(request instanceof Request) || !env?.AUTH_DB ||
      typeof listTeams !== 'function' || typeof readPool !== 'function' ||
      typeof readMatchConfig !== 'function' || typeof verifyIdentity !== 'function') {
    return deny(503, 'Personlig behörighetskontroll saknas');
  }

  const url = new URL(request.url);
  let feature, poolId;
  const matchCreate = url.pathname === '/api/matchkonfiguration' && request.method === 'POST';
  const matchUpdate = /^\/api\/matchkonfiguration\/(\d+)$/.exec(url.pathname);
  const lineupMatch = /^\/api\/laguppstallningar\/(\d+)$/.exec(url.pathname);
  const lineupCreate = !!lineupMatch && request.method === 'POST';
  if (matchCreate) {
    feature = 'matches';
    let body;
    try { body = await request.clone().json(); } catch { return deny(400, 'Ogiltig JSON'); }
    poolId = body?.pool_id;
    if (!Number.isSafeInteger(poolId) || poolId <= 0) return deny(400, 'Ogiltigt poolspel');
  } else if (request.method === 'PATCH' && matchUpdate) {
    feature = 'matches';
  } else if (lineupCreate) {
    feature = 'lineup';
  } else {
    return deny(404, 'Okänd skrivväg');
  }

  const header = request.headers.get('Authorization') || '';
  const tokenMatch = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  if (!tokenMatch) return deny(401, 'Personlig inloggning krävs');
  let actor;
  try { actor = await verifyIdentity(tokenMatch[1]); } catch { actor = null; }
  if (!actor) return deny(401, 'Inloggningen kunde inte verifieras');

  try {
    if (matchUpdate || lineupCreate) {
      const configId = Number((matchUpdate || lineupMatch)[1]);
      if (!Number.isSafeInteger(configId) || configId <= 0) return deny(400, 'Ogiltig matchkonfiguration');
      const config = await readMatchConfig(configId);
      if (!config || Number(config.id) !== configId) return deny(404, 'Matchkonfiguration saknas');
      const links = Array.isArray(config.Poolspel) ? config.Poolspel : [];
      const poolIds = links.map(link => Number(typeof link === 'object' ? link?.id : link));
      if (poolIds.length !== 1 || !Number.isSafeInteger(poolIds[0]) || poolIds[0] <= 0)
        return deny(503, 'Poolspel för matchen kunde inte verifieras');
      poolId = poolIds[0];
      if (matchUpdate) {
        let body;
        try { body = await request.clone().json(); } catch { return deny(400, 'Ogiltig JSON'); }
        if (!Number.isSafeInteger(body?.pool_id) || body.pool_id !== poolId)
          return deny(403, 'Poolspel stämmer inte med matchkonfigurationen');
      }
    }
    const pool = await readPool(poolId);
    if (!pool || Number(pool.id) !== poolId) return deny(404, 'Poolspel saknas');
    const links = Array.isArray(pool.Lag) ? pool.Lag : [];
    const teamIds = links.map(link => Number(typeof link === 'object' ? link?.id : link));
    if (teamIds.length !== 1 || !Number.isSafeInteger(teamIds[0]) || teamIds[0] <= 0)
      return deny(503, 'Lag för poolspelet kunde inte verifieras');
    const teams = await listTeams();
    if (!Array.isArray(teams)) throw new Error('Invalid trusted team list');
    const matches = teams.filter(team => Number(team?.id) === teamIds[0] &&
      String(team['Säsong']) === '2026' && typeof team.Namn === 'string' && team.Namn.trim());
    if (matches.length !== 1) throw new Error('Trusted pool team missing or ambiguous');
    const decision = authorizeTeamFeature(actor, matches[0].Namn, feature);
    if (!decision.allowed) return deny(decision.status, decision.reason);
    return { allowed: true, status: 200, teamId: matches[0].Namn, feature, actor, poolId };
  } catch {
    return deny(503, 'Lag och matchkonfiguration kunde inte verifieras');
  }
}
