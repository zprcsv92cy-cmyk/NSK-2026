import { authorizeTeamFeature } from './team-authorization-policy.js';
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';

/** Checks personal session and persisted pool ownership before access to coach selections. */
export async function authorizeCoachSelection(request, env, {
  readPool,
  listTeams,
  verifyIdentity = token => createPersonalRosterIdentityVerifier(env)(token)
} = {}) {
  const deny = (status, error) => ({ allowed: false, status, error });
  if (!request || !env?.AUTH_DB || typeof readPool !== 'function' ||
      typeof listTeams !== 'function' || typeof verifyIdentity !== 'function')
    return deny(503, 'Personlig behörighetskontroll saknas');

  const url = new URL(request.url);
  if (url.pathname !== '/api/coach-selection' || !['GET','POST'].includes(request.method))
    return deny(404, 'Okänd tränarvalsåtgärd');

  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization') || '');
  if (!match) return deny(401, 'Personlig inloggning krävs');
  let actor;
  try { actor = await verifyIdentity(match[1]); } catch { actor = null; }
  if (!actor) return deny(401, 'Inloggningen kunde inte verifieras');

  let poolId, lagNo, matchNo;
  if (request.method === 'GET') {
    poolId = Number(url.searchParams.get('pool_id'));
    lagNo = Number(url.searchParams.get('lag_no'));
    matchNo = Number(url.searchParams.get('match_no'));
  } else {
    let body;
    try { body = await request.clone().json(); } catch { return deny(400, 'Ogiltig JSON'); }
    poolId = body?.pool_id; lagNo = body?.lag_no; matchNo = body?.match_no;
  }
  if (![poolId,lagNo,matchNo].every(x => Number.isSafeInteger(x) && x > 0))
    return deny(400, 'Ogiltigt poolspel, lag eller match');

  try {
    const pool = await readPool(poolId);
    if (!pool || Number(pool.id) !== poolId) return deny(404, 'Poolspel saknas');
    if (lagNo > Number(pool['Antal lag']) || matchNo > Number(pool['Antal matcher']))
      return deny(400, 'Lag eller match utanför poolspelet');
    const links = Array.isArray(pool.Lag) ? pool.Lag : [];
    const ids = links.map(x => Number(typeof x === 'object' ? x?.id : x));
    if (ids.length !== 1 || !Number.isSafeInteger(ids[0]) || ids[0] <= 0)
      return deny(503, 'Poolspel saknar entydigt ägarlag');
    const teams = await listTeams();
    if (!Array.isArray(teams)) throw Error('Team lookup failed');
    const owners = teams.filter(team => Number(team?.id) === ids[0] &&
      team.Namn === 'NSK Team 18' && String(team['Säsong']) === '2026');
    if (owners.length !== 1) return deny(403, 'Poolspel tillhör inte det tillåtna laget');
    const teamId = owners[0].Namn;
    if (request.method === 'GET') {
      const hasTeam = actor.memberships?.some(m => m.team_id === teamId);
      if (!hasTeam || !actor.permissions?.includes('read'))
        return deny(403, 'Saknar läsbehörighet till laget');
    } else {
      const decision = authorizeTeamFeature(actor, teamId, 'lineup');
      if (!decision.allowed) return deny(decision.status, decision.reason);
    }
    return { allowed: true, status: 200, teamId, poolId, actor };
  } catch {
    return deny(503, 'Ägarskapet kunde inte verifieras');
  }
}
