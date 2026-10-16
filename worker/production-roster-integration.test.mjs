import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { guardRosterRoute } from './production-roster-route-guard.js';
import { resolveLegacyRosterTeam } from './production-roster-team-resolver.js';

const teams = [{ id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }];
const actor = { memberships: [{ team_id: '18', role: 'team_admin' }], permissions: ['roster:manage'] };
const request = (method, path, token = 'valid') => new Request('https://example.test' + path, {
  method, headers: token ? { Authorization: 'Bearer ' + token } : {}
});
async function run(req, { readRow = async () => ({ Lag: [{ id: 18 }] }), listTeams = async () => teams, verifyIdentity = async () => actor } = {}) {
  let writes = 0;
  const result = await guardRosterRoute(req, {
    resolveTeamId: r => resolveLegacyRosterTeam(r, { readRow, listTeams }),
    verifyIdentity,
    mutate: async () => { writes++; return { ok: true }; }
  });
  return { result, writes };
}

test('authorized player PATCH for Team 18 writes once', async () => {
  const { result, writes } = await run(request('PATCH', '/api/spelare/7'));
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
});
test('authorized coach POST uses trusted Team 18 mapping', async () => {
  const { result, writes } = await run(request('POST', '/api/tranare?team_id=2'));
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
});
test('cross-team persisted player cannot be modified', async () => {
  const { result, writes } = await run(request('PATCH', '/api/spelare/7'), { readRow: async () => ({ Lag: [{ id: 2 }] }) });
  assert.equal(result.status, 502);
  assert.equal(writes, 0);
});
test('read-only Team 18 member cannot modify roster', async () => {
  const { result, writes } = await run(request('PATCH', '/api/spelare/7'), { verifyIdentity: async () => ({ memberships: [{ team_id: '18', role: 'viewer' }], permissions: [] }) });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});
test('invalid personal session cannot modify roster', async () => {
  const { result, writes } = await run(request('POST', '/api/spelare'), { verifyIdentity: async () => null });
  assert.equal(result.status, 401);
  assert.equal(writes, 0);
});
test('missing bearer token does not even access Baserow', async () => {
  let lookups = 0;
  const { result, writes } = await run(request('PATCH', '/api/tranare/7', ''), {
    listTeams: async () => { lookups++; return teams; }
  });
  assert.equal(result.status, 401);
  assert.equal(lookups, 0);
  assert.equal(writes, 0);
});
test('team lookup outage fails closed', async () => {
  const { result, writes } = await run(request('POST', '/api/spelare'), {
    listTeams: async () => { throw Error('offline'); }
  });
  assert.equal(result.status, 502);
  assert.equal(writes, 0);
});
