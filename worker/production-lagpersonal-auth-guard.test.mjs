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

test('lagpersonal viewer is denied for both POST and PATCH before mutation', async () => {
  const viewer = { memberships: [{ team_id: '18', role: 'viewer' }], permissions: ['roster:manage'] };
  for (const method of ['POST', 'PATCH']) {
    const { result, writes } = await run(req(method, 18), { verifyIdentity: async () => viewer });
    assert.equal(result.status, 403, method);
    assert.equal(writes, 0, method);
  }
});

test('lagpersonal missing bearer blocks POST and PATCH before trusted lookups', async () => {
  for (const method of ['POST', 'PATCH']) {
    const { result, writes, lookups } = await run(req(method, 18, ''), {
      verifyIdentity: async () => { throw Error('Must not verify missing credentials'); }
    });
    assert.equal(result.status, 401, method);
    assert.equal(lookups, 0, method);
    assert.equal(writes, 0, method);
  }
});

test('lagpersonal PATCH cannot cross team boundary even with administrator permission', async () => {
  const { result, writes } = await run(req('PATCH', 18), {
    readStaff: async () => ({ team_id: '2' })
  });
  assert.equal(result.status, 502);
  assert.equal(writes, 0);
});

test('lagpersonal rejects duplicate team and staff query parameters', async () => {
  for (const [method, path] of [
    ['POST', '/api/lagpersonal?team_id=18&team_id=2'],
    ['POST', '/api/lagpersonal?team_id=18&team_id=18'],
    ['PATCH', '/api/lagpersonal?team_id=18&id=staff1&id=staff2']
  ]) {
    const request = new Request('https://example.test' + path, {
      method, headers: { Authorization: 'Bearer valid' }
    });
    const { result, writes } = await run(request);
    assert.equal(result.status, 502, method + ' ' + path);
    assert.equal(writes, 0, method + ' ' + path);
  }
});

test('lagpersonal rejects duplicate trusted team records', async () => {
  const { result, writes } = await run(req('POST', 18), {
    listTeams: async () => [{ id: 18 }, { id: 18 }]
  });
  assert.equal(result.status, 502);
  assert.equal(writes, 0);
});
