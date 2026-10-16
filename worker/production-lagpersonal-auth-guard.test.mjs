import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { guardLagpersonalMutation, resolveLagpersonalTeam } from './production-lagpersonal-auth-guard.js';

const teams = [{ id: 18 }, { id: 2 }];
const actor = { memberships: [{ team_id: '18', role: 'team_admin' }], permissions: ['roster:manage'] };
const req = (method, team, token = 'valid') => new Request('https://example.test/api/lagpersonal?team_id=' + team + (method === 'PATCH' ? '&id=staff1' : ''), {
  method, headers: token ? { Authorization: 'Bearer ' + token } : {}
});
async function run(request, { listTeams = async () => teams, readStaff = async () => ({ team_id: '18' }), verifyIdentity = async () => actor } = {}) {
  let writes = 0, lookups = 0;
  const result = await guardLagpersonalMutation(request, {
    resolveTeamId: r => { lookups++; return resolveLagpersonalTeam(r, { listTeams, readStaff }); },
    verifyIdentity,
    mutate: async () => { writes++; return { ok: true }; }
  });
  return { result, writes, lookups };
}
test('Team 18 admin may create lagpersonal', async () => {
  const { result, writes } = await run(req('POST', 18));
  assert.equal(result.ok, true); assert.equal(writes, 1);
});
test('Team 18 admin may update lagpersonal', async () => {
  const { result, writes } = await run(req('PATCH', 18));
  assert.equal(result.ok, true); assert.equal(writes, 1);
});
test('Team 18 admin cannot change Team 2', async () => {
  const { result, writes } = await run(req('POST', 2));
  assert.equal(result.status, 403); assert.equal(writes, 0);
});
test('unknown team fails closed', async () => {
  const { result, writes } = await run(req('POST', 999));
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
test('invalid team ID fails closed', async () => {
  const { result, writes } = await run(req('POST', '18abc'));
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
test('missing token prevents even team lookup', async () => {
  const { result, writes, lookups } = await run(req('POST', 18, ''));
  assert.equal(result.status, 401); assert.equal(writes, 0); assert.equal(lookups, 0);
});
test('invalid personal session denies write', async () => {
  const { result, writes } = await run(req('PATCH', 18), { verifyIdentity: async () => null });
  assert.equal(result.status, 401); assert.equal(writes, 0);
});
test('viewer cannot change lagpersonal', async () => {
  const { result, writes } = await run(req('POST', 18), {
    verifyIdentity: async () => ({ memberships: [{ team_id: '18', role: 'viewer' }], permissions: ['roster:manage'] })
  });
  assert.equal(result.status, 403); assert.equal(writes, 0);
});
test('team lookup outage fails closed', async () => {
  const { result, writes } = await run(req('POST', 18), { listTeams: async () => { throw Error('offline'); } });
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
test('GET is not a mutation', async () => {
  const { result, writes } = await run(req('GET', 18));
  assert.equal(result.status, 405); assert.equal(writes, 0);
});

test('PATCH cannot alter persisted staff owned by another team', async () => {
  const { result, writes } = await run(req('PATCH', 18), { readStaff: async () => ({ team_id: '2' }) });
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
test('PATCH cannot proceed when stored staff is missing', async () => {
  const { result, writes } = await run(req('PATCH', 18), { readStaff: async () => null });
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
test('PATCH cannot proceed without persisted staff lookup', async () => {
  const { result, writes } = await run(req('PATCH', 18), { readStaff: null });
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
