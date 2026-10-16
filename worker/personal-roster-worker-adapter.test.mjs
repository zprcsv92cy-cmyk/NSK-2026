import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { authorizePersonalWorkerWrite } from './personal-roster-worker-adapter.js';

const token = 'A'.repeat(40), hash = createHash('sha256').update(token).digest('hex');
const teams = [{ id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }, { id: 2, Namn: 'Testlag 2', 'Säsong': '2026' }];
function env(role = 'team_admin', permissions = ['roster:manage']) {
  return { AUTH_DB: { prepare(sql) { return { bind(...args) { return {
    async first() { assert.equal(args[0], hash); return { id: 'u1', display_name: 'Tester' }; },
    async all() { return { results: sql.includes('auth_team_memberships') ? [{ team_id: '18', role }] : permissions.map(permission => ({ permission })) }; }
  }; } }; } } };
}
const req = (method, path, auth = token) => new Request('https://example.test' + path, {
  method, headers: auth ? { Authorization: 'Bearer ' + auth } : {}
});
async function run(request, identity = env(), row = { Lag: [{ id: 18 }] }) {
  let rosterWrites = 0, staffWrites = 0;
  const result = await authorizePersonalWorkerWrite(request, identity, {
    listTeams: async () => teams,
    readRow: async () => row,
    readStaff: async () => ({ team_id: '18' }),
    mutateRoster: async () => { rosterWrites++; return { ok: true }; },
    mutateLagpersonal: async () => { staffWrites++; return { ok: true }; }
  });
  return { result, rosterWrites, staffWrites };
}
test('personal admin may add player to trusted team', async () => {
  const x = await run(req('POST', '/api/spelare?team_id=2'));
  assert.equal(x.result.ok, true); assert.equal(x.rosterWrites, 1);
});
test('personal admin may update own team player', async () => {
  const x = await run(req('PATCH', '/api/spelare/17'));
  assert.equal(x.result.ok, true); assert.equal(x.rosterWrites, 1);
});
test('personal admin cannot update foreign player', async () => {
  const x = await run(req('PATCH', '/api/spelare/17'), env(), { Lag: [{ id: 2 }] });
  assert.equal(x.result.status, 502); assert.equal(x.rosterWrites, 0);
});
test('personal admin may add team staff', async () => {
  const x = await run(req('POST', '/api/lagpersonal?team_id=18'));
  assert.equal(x.result.ok, true); assert.equal(x.staffWrites, 1);
});
test('personal admin cannot add staff to Testlag 2', async () => {
  const x = await run(req('POST', '/api/lagpersonal?team_id=2'));
  assert.equal(x.result.status, 403); assert.equal(x.staffWrites, 0);
});
test('viewer cannot add player', async () => {
  const x = await run(req('POST', '/api/spelare'), env('viewer'));
  assert.equal(x.result.status, 403); assert.equal(x.rosterWrites, 0);
});
test('missing D1 binding denies write', async () => {
  const x = await run(req('POST', '/api/spelare'), {});
  assert.equal(x.result.status, 401); assert.equal(x.rosterWrites, 0);
});
test('shared admin token is not a personal session', async () => {
  const x = await run(req('POST', '/api/lagpersonal?team_id=18', 'legacy-admin'));
  assert.equal(x.result.status, 401); assert.equal(x.staffWrites, 0);
});
test('unknown write path denied', async () => {
  const x = await run(req('POST', '/api/unknown'));
  assert.equal(x.result.status, 404); assert.equal(x.rosterWrites, 0);
});

test('worker adapter denies PATCH when persisted staff belongs to Team 2', async () => {
  let writes = 0;
  const result = await authorizePersonalWorkerWrite(req('PATCH', '/api/lagpersonal?team_id=18&id=staff1'), env(), {
    listTeams: async () => teams,
    readStaff: async () => ({ team_id: '2' }),
    mutateLagpersonal: async () => { writes++; return { ok: true }; }
  });
  assert.equal(result.status, 502); assert.equal(writes, 0);
});
