import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { handlePersonalLagpersonalWrite } from './production-lagpersonal-write-handler.js';

const token = 'A'.repeat(40);
const hash = createHash('sha256').update(token).digest('hex');
function setup(role = 'team_admin', permissions = ['roster:manage']) {
  const kv = new Map();
  let writes = 0;
  const env = {
    AUTH_DB: { prepare(sql) { return { bind(...args) { return {
      async first() { assert.equal(args[0], hash); return { id: 'u1', display_name: 'Tester' }; },
      async all() { return { results: sql.includes('auth_team_memberships')
        ? [{ team_id: '18', role }] : permissions.map(permission => ({ permission })) }; }
    }; } }; } },
    NSK_TRAINERS: {
      async get(key) { return kv.has(key) ? JSON.parse(kv.get(key)) : null; },
      async put(key, value) { writes++; kv.set(key, value); }
    }
  };
  return { env, kv, get writes() { return writes; }, listTeams: async () => [{ id: 18 }, { id: 2 }] };
}
function request(method, team = '18', bearer = token, body = { name: 'Alex', role: 'Lagledare' }) {
  return new Request('https://example.test/api/lagpersonal?team_id=' + team, {
    method, headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}
test('authorized member creates and updates staff in own team KV', async () => {
  const x = setup();
  const created = await handlePersonalLagpersonalWrite(request('POST'), x.env, x);
  assert.equal(created.status, 201);
  const updated = await handlePersonalLagpersonalWrite(request('PATCH', '18', token,
    { id: created.row.id, name: 'Alexandra', role: 'Lagledare' }), x.env, x);
  assert.equal(updated.status, 200);
  assert.equal(x.kv.get('lagpersonal:team:18').includes('Alexandra'), true);
  assert.equal(x.writes, 2);
});
test('foreign team is denied without KV mutation', async () => {
  const x = setup();
  const result = await handlePersonalLagpersonalWrite(request('POST', '2'), x.env, x);
  assert.equal(result.status, 403); assert.equal(x.writes, 0);
});
test('viewer is denied without KV mutation', async () => {
  const x = setup('viewer');
  const result = await handlePersonalLagpersonalWrite(request('POST'), x.env, x);
  assert.equal(result.status, 403); assert.equal(x.writes, 0);
});
test('missing personal session is denied without KV mutation', async () => {
  const x = setup();
  const result = await handlePersonalLagpersonalWrite(request('POST', '18', 'legacy-admin'), x.env, x);
  assert.equal(result.status, 401); assert.equal(x.writes, 0);
});
test('missing D1 binding fails closed', async () => {
  const x = setup(); delete x.env.AUTH_DB;
  const result = await handlePersonalLagpersonalWrite(request('POST'), x.env, x);
  assert.equal(result.status, 503); assert.equal(x.writes, 0);
});
test('duplicate team IDs fail closed', async () => {
  const x = setup();
  const r = new Request('https://example.test/api/lagpersonal?team_id=18&team_id=18', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Alex', role: 'Lagledare' })
  });
  const result = await handlePersonalLagpersonalWrite(r, x.env, x);
  assert.equal(result.status, 502); assert.equal(x.writes, 0);
});
