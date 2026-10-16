import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { authorizePersonalWorkerWrite } from './personal-roster-worker-adapter.js';

const personalToken = 'P'.repeat(40);
const digest = createHash('sha256').update(personalToken).digest('hex');
const teams = [{ id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }, { id: 2, Namn: 'Testlag 2', 'Säsong': '2026' }];
let writes = 0, lookupCount = 0;
const env = { AUTH_DB: { prepare(sql) { return { bind(...params) { return {
  async first() { assert.equal(params[0], digest); return { id: 'user18', display_name: 'Test' }; },
  async all() { return { results: sql.includes('auth_team_memberships')
    ? [{ team_id: '18', role: 'team_admin' }] : [{ permission: 'roster:manage' }] }; }
}; } }; } } };
const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const request = new Request('http://127.0.0.1' + incoming.url, {
      method: incoming.method, headers: incoming.headers,
      ...(chunks.length ? { body: Buffer.concat(chunks) } : {})
    });
    const result = await authorizePersonalWorkerWrite(request, env, {
      listTeams: async () => { lookupCount++; return teams; },
      readRow: async (_, id) => ({ id, Lag: [{ id: id === 99 ? 2 : 18 }] }),
      readTeamStaff: async () => [{ id: '123e4567-e89b-12d3-a456-426614174000', role: 'Lagledare' }],
      mutateRoster: async () => { writes++; return { ok: true, status: 200 }; },
      mutateLagpersonal: async () => { writes++; return { ok: true, status: 200 }; }
    });
    outgoing.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
    outgoing.end(JSON.stringify(result));
  } catch (error) {
    outgoing.writeHead(500); outgoing.end(JSON.stringify({ error: String(error) }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = 'http://127.0.0.1:' + server.address().port;
async function call(method, path, auth = personalToken, body = undefined) {
  const response = await fetch(url + path, {
    method, headers: { ...(auth ? { Authorization: 'Bearer ' + auth } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, body: await response.json() };
}
try {
  await test('HTTP personal session creates player in trusted team', async () => {
    const before = writes;
    const x = await call('POST', '/api/spelare?team_id=2');
    assert.equal(x.status, 200); assert.equal(writes, before + 1);
  });
  await test('HTTP personal session updates own team player', async () => {
    const before = writes;
    const x = await call('PATCH', '/api/spelare/17');
    assert.equal(x.status, 200); assert.equal(writes, before + 1);
  });
  await test('HTTP cannot update foreign team player', async () => {
    const before = writes;
    const x = await call('PATCH', '/api/spelare/99');
    assert.equal(x.status, 502); assert.equal(writes, before);
  });
  await test('HTTP personal session creates own team staff', async () => {
    const before = writes;
    const x = await call('POST', '/api/lagpersonal?team_id=18');
    assert.equal(x.status, 200); assert.equal(writes, before + 1);
  });
  await test('HTTP cross-team staff write is denied', async () => {
    const before = writes;
    const x = await call('POST', '/api/lagpersonal?team_id=2');
    assert.equal(x.status, 403); assert.equal(writes, before);
  });
  await test('HTTP personal session updates persisted own team staff', async () => {
    const before = writes;
    const x = await call('PATCH', '/api/lagpersonal?team_id=18', personalToken, { id: '123e4567-e89b-12d3-a456-426614174000', role: 'Lagledare' });
    assert.equal(x.status, 200); assert.equal(writes, before + 1);
  });
  await test('HTTP persisted foreign staff cannot be edited via Team 18', async () => {
    const before = writes;
    const x = await call('PATCH', '/api/lagpersonal?team_id=18', personalToken, { id: '223e4567-e89b-12d3-a456-426614174000', role: 'Lagledare' });
    assert.equal(x.status, 502); assert.equal(writes, before);
  });
  await test('HTTP missing persisted staff cannot be edited', async () => {
    const before = writes;
    const x = await call('PATCH', '/api/lagpersonal?team_id=18', personalToken, { id: '323e4567-e89b-12d3-a456-426614174000', role: 'Lagledare' });
    assert.equal(x.status, 502); assert.equal(writes, before);
  });
  await test('HTTP PATCH without staff ID is denied', async () => {
    const before = writes;
    const x = await call('PATCH', '/api/lagpersonal?team_id=18', personalToken, { role: 'Lagledare' });
    assert.equal(x.status, 502); assert.equal(writes, before);
  });
  await test('HTTP missing bearer token is denied before team lookup', async () => {
    const before = writes, lookups = lookupCount;
    const x = await call('POST', '/api/lagpersonal?team_id=18', '');
    assert.equal(x.status, 401); assert.equal(writes, before); assert.equal(lookupCount, lookups);
  });
  await test('HTTP legacy admin token is not a personal session', async () => {
    const before = writes;
    const x = await call('POST', '/api/spelare', 'legacy-admin');
    assert.equal(x.status, 401); assert.equal(writes, before);
  });
  await test('HTTP unknown mutation route is rejected', async () => {
    const before = writes;
    const x = await call('POST', '/api/other');
    assert.equal(x.status, 404); assert.equal(writes, before);
  });
} finally {
  await new Promise(resolve => server.close(resolve));
}
