// Fail-closed guard for team-owned Baserow collection reads.
// Wired behind a rollout flag; shared-pool records require a verified Lagnummer owner.
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';

const ALLOWED = new Set(['poolspel', 'matchkonfiguration', 'laguppstallningar', 'bytesschema', 'spelaretranare']);
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
    if (match[1] === 'spelaretranare') {
      const [players, coaches, mappings] = await Promise.all([
        readRows('spelare'), readRows('tranare'), readRows('spelaretranare')
      ]);
      if (![players, coaches, mappings].every(Array.isArray)) throw Error('Incomplete association snapshot');
      const owned = rows => new Set(rows.filter(row => linkedIds(row.Lag).includes(teams[0])).map(rowId));
      const playerIds = owned(players);
      const coachIds = owned(coaches);
      const results = mappings.filter(row => {
        rowId(row);
        const p = linkedIds(row.Spelare), c = linkedIds(row['Tränare']);
        return p.length === 1 && c.length === 1 && playerIds.has(p[0]) && coachIds.has(c[0]);
      });
      return Response.json({ok:true,table:'spelaretranare',results,count:results.length,next:null,previous:null},
        {headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    }
    // Pool metadata only depends on pool ownership, never on match/shift availability.
    if (match[1] === 'poolspel') {
      const pools = await readRows('poolspel');
      if (!Array.isArray(pools)) throw Error('Incomplete pool snapshot');
      const results = pools.filter(p => {
        rowId(p);
        return linkedIds(p.Lag).includes(teams[0]);
      });
      return Response.json({ok:true,table:'poolspel',results,count:results.length,next:null,previous:null},
        {headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    }
    const [pools, configs, lineups, shifts] = await Promise.all([
      readRows('poolspel'), readRows('matchkonfiguration'),
      readRows('laguppstallningar'), readRows('bytesschema')
    ]);
    if (![pools, configs, lineups, shifts].every(Array.isArray))
      throw Error('Incomplete table snapshot');
    // Pool membership permits reading shared pool metadata, but individual
    // match records must belong to the requested team via Lagnummer.
    const poolById = new Map(pools.map(p => [rowId(p), p]));
    const permittedPools = new Set(pools.filter(p =>
      linkedIds(p.Lag).includes(teams[0])).map(rowId));
    const oneLink = value => {
      const links = linkedIds(value);
      return links.length === 1 ? links[0] : null;
    };
    const ownsMatch = (poolId, lagNo) => {
      const pool = poolById.get(poolId);
      if (!pool || !permittedPools.has(poolId)) return false;
      const owners = linkedIds(pool.Lag);
      const count = Number(pool['Antal lag']);
      const index = Number(lagNo);
      if (!Number.isSafeInteger(index) || index < 1 ||
          !Number.isSafeInteger(count) || count < 1 || index > count)
        return false;
      // The existing shift owner resolver maps single-link pools to that
      // team for all valid Lagnummer values. Shared pools use link order.
      if (owners.length === 1) return owners[0] === teams[0];
      return owners.length === count && owners[index - 1] === teams[0];
    };
    const configPoolById = new Map(configs.flatMap(c => {
      const poolId = oneLink(c.Poolspel);
      return poolId && ownsMatch(poolId, c.Lagnummer)
        ? [[rowId(c), poolId]] : [];
    }));
    const results = {
      poolspel: pools.filter(p => permittedPools.has(rowId(p))),
      matchkonfiguration: configs.filter(c =>
        configPoolById.has(rowId(c))),
      laguppstallningar: lineups.filter(l => {
        const configId = oneLink(l.Matchkonfiguration);
        const poolId = oneLink(l.Poolspel);
        return configId !== null && poolId !== null &&
          configPoolById.get(configId) === poolId;
      }),
      bytesschema: shifts.filter(s => {
        const poolId = oneLink(s.Poolspel);
        return poolId !== null && ownsMatch(poolId, s.Lagnummer);
      })
    }[match[1]];
    return Response.json({
      ok: true, table: match[1], results, count: results.length, next: null, previous: null
    }, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
  } catch {
    return deny(503, 'Laguppgifter kunde inte verifieras');
  }
}
