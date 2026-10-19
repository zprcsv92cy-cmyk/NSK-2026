import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';

const deny = (status, error) => Response.json(
  { ok: false, error },
  { status, headers: { 'cache-control': 'no-store' } }
);

export async function readPersonallyAuthorizedTeams(
  request,
  env,
  { listTrustedTeams, verifyPersonalSession } = {}
) {
  if (request.method !== 'GET') {
    return deny(405, 'Metoden stöds inte');
  }

  const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(
    request.headers.get('Authorization') || ''
  )?.[1];

  if (!token) {
    return deny(401, 'Personlig inloggning krävs');
  }

  if (typeof listTrustedTeams !== 'function') {
    return deny(503, 'Säker lagkälla saknas');
  }

  try {
    const verify = verifyPersonalSession ||
      createPersonalRosterIdentityVerifier(env);

    const actor = await verify(token);

    if (!actor) {
      return deny(401, 'Giltig session krävs');
    }

    const teams = await listTrustedTeams();

    if (!Array.isArray(teams)) {
      throw new Error('Ogiltig laglista');
    }

    const mapped = mapTrustedMembershipsToLegacyTeams(actor, teams);

    if (!mapped.permissions.includes('read')) {
      return deny(403, 'Saknar läsbehörighet');
    }

    const allowed = new Set(
      mapped.memberships.map(member => member.team_id)
    );

    const results = teams
      .filter(team => allowed.has(String(team.id)))
      .map(team => ({
        id: team.id,
        Namn: team.Namn,
        'Säsong': team['Säsong']
      }));

    return Response.json({
      ok: true,
      table: 'lag',
      results,
      count: results.length,
      next: null,
      previous: null
    }, {
      headers: { 'cache-control': 'no-store' }
    });
  } catch {
    return deny(503, 'Laguppgifter kunde inte verifieras');
  }
}
