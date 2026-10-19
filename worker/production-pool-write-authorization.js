import { authorizeTeamFeature } from './team-authorization-policy.js';
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';

/**
 * Authorize pool writes using a server-verified personal session and the
 * pool's trusted Baserow team link. This helper never mutates storage.
 */
export async function authorizePersonalPoolWrite(request, env, {
  listTeams,
  readPool,
  verifyIdentity = token => createPersonalRosterIdentityVerifier(env)(token)
} = {}) {
  const deny = (status, error) => ({ allowed: false, status, error });
  if (!(request instanceof Request) || !env?.AUTH_DB ||
      typeof listTeams !== 'function' || typeof readPool !== 'function' ||
      typeof verifyIdentity !== 'function') {
    return deny(503, 'Personlig behörighetskontroll saknas');
  }
  const url = new URL(request.url);
  let feature;
  let poolId = null;
  if (url.pathname === '/api/poolspel' && request.method === 'POST') {
    feature = 'pool';
  } else {
    const active = /^\\/api\\/poolspel\\/(\\d+)\\/aktiv$/.exec(url.pathname);
    const pool = /^\\/api\\/poolspel\\/(\\d+)$/.exec(url.pathname);
    if (request.method !== 'PATCH' || (!active && !pool)) return deny(404, 'Okänd skrivväg');
    poolId = Number((active || pool)[1]);
    if (!Number.isSafeInteger(poolId) || poolId <= 0) return deny(400, 'Ogiltigt poolspel');
    if (active) {
      let body;
      try { body = await request.clone().json(); } catch { return deny(400, 'Ogiltig JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).length !== 1 || typeof body.active !== 'boolean') {
        return deny(400, 'Ogiltigt Aktiv-värde');
      }
      feature = body.active ? 'pool_reopen' : 'pool_finish';
    } else {
      feature = 'pool';
    }
  }

  const header = request.headers.get('Authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  if (!match) return deny(401, 'Personlig inloggning krävs');

  let actor;
  try { actor = await verifyIdentity(match[1]); } catch { actor = null; }
  if (!actor) return deny(401, 'Inloggningen kunde inte verifieras');

  let teams, target;
  try {
    teams = await listTeams();
    if (!Array.isArray(teams)) throw new Error('Invalid trusted team list');
    if (poolId === null) {
      const matches = teams.filter(team => team?.Namn === 'NSK Team 18' &&
        String(team['Säsong']) === '2026' && /^[1-9]\\d*$/.test(String(team.id)));
      if (matches.length !== 1) throw new Error('Trusted target team missing or ambiguous');
      target = matches[0];
    } else {
      const row = await readPool(poolId);
      if (!row || Number(row.id) !== poolId) return deny(404, 'Poolspel saknas');
      const links = Array.isArray(row.Lag) ? row.Lag : [];
      const ids = links.map(link => Number(typeof link === 'object' ? link?.id : link));
      if (ids.length !== 1 || !Number.isSafeInteger(ids[0]) || ids[0] <= 0)
        throw new Error('Pool owner is ambiguous');
      const matches = teams.filter(team => Number(team?.id) === ids[0] &&
        String(team['Säsong']) === '2026' && typeof team.Namn === 'string' && team.Namn.trim());
      if (matches.length !== 1) throw new Error('Trusted pool owner missing or ambiguous');
      target = matches[0];
    }
  } catch {
    return deny(503, 'Lag och poolspel kunde inte verifieras');
  }

  const decision = authorizeTeamFeature(actor, target.Namn, feature);
  if (!decision.allowed) return deny(decision.status, decision.reason);
  return { allowed: true, status: 200, teamId: target.Namn, feature, actor };
}

