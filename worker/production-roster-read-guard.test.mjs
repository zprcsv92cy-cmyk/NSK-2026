import assert from 'node:assert/strict';
import { guardProductionRosterRead as guard } from './production-roster-read-guard.js';

const token = 'a'.repeat(43);
const req = (path, auth = true, method = 'GET') => new Request(
  'https://nsk-api.example' + path, { method, headers: auth ? { Authorization: 'Bearer ' + token } : {} });
const actor = { user: { id: 'user-1' }, memberships: [{ team_id: '18', role: 'viewer' }], permissions: ['read'] };
let reads = 0, owners = 0, sessions = 0;
const deps = {
  verifyIdentity: async () => { sessions++; return actor; },
  resolveOwnerTeam: async () => { owners++; return '18'; },
  readTeamData: async () => { reads++; return Response.json({ ok: true, results: [] }); }
};
async function check(path, status, overrides = {}, auth = true, method = 'GET') {
  const response = await guard(req(path, auth, method), { ...deps, ...overrides });
  assert.equal(response.status, status, path + ': ' + await response.text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
await check('/api/spelare?team_id=18', 200);
assert.equal(reads, 1);
await check('/api/spelare?team_id=19', 403);
await check('/api/spelare?team_id=18', 403, { verifyIdentity: async () => ({ ...actor, permissions: [] }) });
await check('/api/spelare?team_id=18', 403, { verifyIdentity: async () => ({ ...actor, permissions: undefined }) });
await check('/api/spelare?team_id=18&team_id=19', 403);
await check('/api/spelare', 401, {}, false);
await check('/api/spelare', 403, { resolveOwnerTeam: async () => '19' });
await check('/api/spelare', 503, { resolveOwnerTeam: async () => null });
await check('/api/spelare', 503, { resolveOwnerTeam: async () => { throw Error('db offline'); } });
await check('/api/spelare', 503, { verifyIdentity: async () => { throw Error('auth offline'); } });
await check('/api/spelare', 401, { verifyIdentity: async () => null });
await check('/api/spelare', 503, { readTeamData: async () => { throw Error('read failure'); } });
await check('/api/spelare', 503, { readTeamData: async () => ({ ok: true }) });
await check('/api/spelare', 503, { readTeamData: undefined });
await check('/api/lag', 404);
await check('/api/poolspel', 404);
await check('/api/spelare', 405, {}, true, 'POST');
assert.equal(reads, 1, 'Denied requests must never read team data');
const extra = await guard(req('/api/lagpersonal'), deps);
assert.equal(extra.status, 200);
assert.equal(reads, 2);
console.log('PASS production team read guard (isolated; no live production integration)');
