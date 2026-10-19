// Isolated, fail-closed guard for team-owned Baserow collection reads.
// Not wired into the production Worker until frontend and ownership tests pass.
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';

const ALLOWED = new Set(['poolspel', 'matchkonfiguration', 'laguppstallningar', 'bytesschema']);
const deny = (status, error) => Response.json({ ok: false, error }, {
  status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
});

function linkedIds(value) {
  if (!Array.isArray(value)) throw Error('Invalid ownership links');
  return value.map(link => {
    const raw = link && typeof link === 'object' ? link.id : link;
    const id = String(raw);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
      throw Error('Invalid linked row');
    return id;
  });
}

function rowId(row) {
  const id = String(row?.id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))
    throw Error('Invalid row id');
  return id;
}

export async function readPersonallyAuthorizedTeamCollection(request, env, {
  listTrustedTeams, readRows, verifyPersonalSession
} = {}) {
  if (!(request instanceof Request)) return deny(400, 'Ogiltig begäran');
  if (request.method !== 'GET') return deny(405, 'Metoden stöds inte');
  const url = new URL(request.url);
  const match = /^\/api\/([a-z]+)$/.exec(url.pathname);
  if (!match || !ALLOWED.has(match[1])) return deny(404, 'Okänd läsväg');
  const teams = url.searchParams.getAll('team_id');
  if (teams.length !== 1 || !/^[1-9]\d*$/.test(teams[0]) ||
      !Number.isSafeInteger(Number(teams[0])) || url.searchParams.has('teamId'))
    return deny(400, 'Ett giltigt lag krävs');
  const token = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return deny(401, 'Personlig inloggning krävs');
  if (typeof listTrustedTeams !== 'function' || typeof readRows !== 'function')
    return deny(503, 'Säker serverkoppling saknas');
  try {
    const actor = await (verifyPersonalSession || createPersonalRosterIdentityVerifier(env))(token);
    if (!actor) return deny(401, 'Giltig session krävs');
    const trustedTeams = await listTrustedTeams();
    const mapped = mapTrustedMembershipsToLegacyTeams(actor, trustedTeams);
    if (!mapped.memberships.some(m => m.team_id === teams[0]) ||
        !mapped.permissions.includes('read'))
      return deny(403, 'Saknar läsbehörighet');
    // Fail closed if any referenced table cannot be fully loaded or resolved.
    const [pools, configs, lineups, shifts] = await Promise.all([
      readRows('poolspel'), readRows('matchkonfiguration'),
      readRows('laguppstallningar'), readRows('bytesschema')
    ]);
    if (![pools, configs, lineups, shifts].every(Array.isArray))
      throw Error('Incomplete table snapshot');
    // A shared pool can contain match records for multiple teams. Until each
    // match is mapped to its actual owner, exclude shared pools entirely.
    // This sacrifices availability rather than exposing another team's data.
    const poolIds = new Set(pools.filter(p => {
      const owners = linkedIds(p.Lag);
      return owners.length === 1 && owners[0] === teams[0];
    }).map(rowId));
    const configIds = new Set(configs.filter(c =>
      linkedIds(c.Poolspel).some(id => poolIds.has(id))).map(rowId));
    const results = {
      poolspel: pools.filter(p => poolIds.has(rowId(p))),
      matchkonfiguration: configs.filter(c =>
        linkedIds(c.Poolspel).some(id => poolIds.has(id))),
      laguppstallningar: lineups.filter(l =>
        linkedIds(l.Matchkonfiguration).some(id => configIds.has(id)) &&
        linkedIds(l.Poolspel).every(id => poolIds.has(id))),
      bytesschema: shifts.filter(s =>
        linkedIds(s.Poolspel).some(id => poolIds.has(id)))
    }[match[1]];
    return Response.json({
      ok: true, table: match[1], results, count: results.length, next: null, previous: null
    }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  } catch {
    return deny(503, 'Laguppgifter kunde inte verifieras');
  }
}
