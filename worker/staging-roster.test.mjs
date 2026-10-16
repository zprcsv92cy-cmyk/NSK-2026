import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { stagingRoster } from './staging-roster.js';

const admin = { memberships: [{ team_id: 'team-18', role: 'team_admin' }], permissions: ['roster:manage'] };
const json = (body, status = 200) => ({ body, status });
const request = (method, team, body) => new Request('https://example.test/api/auth/roster-staging?team_id=' + team, {
  method, ...(body ? { body: JSON.stringify(body) } : {})
});
function store() {
  const calls = [];
  return { calls, prepare(sql) {
    const entry = { sql, args: [] }; calls.push(entry);
    return { bind(...args) {
      entry.args = args;
      return { all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) };
    } };
  } };
}
test('authorized read scopes database query to membership team', async () => {
  const db = store();
  const result = await stagingRoster(request('GET', 'team-18'), db, admin, json);
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls[0].args, ['team-18']);
});
test('cross-team reads and writes never access database', async () => {
  const db = store();
  const read = await stagingRoster(request('GET', 'team-2'), db, admin, json);
  const write = await stagingRoster(request('POST', 'team-2', { kind: 'player', name: 'Test' }), db, admin, json);
  assert.equal(read.status, 403);
  assert.equal(write.status, 403);
  assert.equal(db.calls.length, 0);
});
test('coach can read but cannot write', async () => {
  const db = store();
  const coach = { memberships: [{ team_id: 'team-18', role: 'coach' }], permissions: ['roster:manage'] };
  const read = await stagingRoster(request('GET', 'team-18'), db, coach, json);
  const write = await stagingRoster(request('POST', 'team-18', { kind: 'player', name: 'Test' }), db, coach, json);
  assert.equal(read.body.canManage, false);
  assert.equal(write.status, 403);
  assert.equal(db.calls.length, 1);
});
test('authorized POST writes to own team', async () => {
  const db = store();
  const result = await stagingRoster(request('POST', 'team-18', { kind: 'player', name: 'Test' }), db, admin, json);
  assert.equal(result.status, 201);
  assert.equal(db.calls[0].args[1], 'team-18');
});
