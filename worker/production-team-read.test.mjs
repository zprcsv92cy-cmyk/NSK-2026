import test from 'node:test';
import assert from 'node:assert/strict';
import { readPersonallyAuthorizedTeams } from './production-team-read.js';

const token = 'a'.repeat(40);
const teams = [
  { id: 101, Namn: 'NSK Team 18', 'Säsong': '2026', hemlig: 'privat' },
  { id: 102, Namn: 'NSK Testlag 2', 'Säsong': '2026', hemlig: 'privat' }
];

const actor = {
  user: { id: 'test-user' },
  memberships: [{ team_id: 'NSK Team 18', role: 'admin' }],
  permissions: ['read']
};

const request = (authorization = `Bearer ${token}`) =>
  new Request('https://example.com/api/lag', {
    headers: authorization ? { Authorization: authorization } : {}
  });

const deps = {
  listTrustedTeams: async () => teams,
  verifyPersonalSession: async () => actor
};

test('returns only authorized team and public fields', async () => {
  const response = await readPersonallyAuthorizedTeams(request(), {}, deps);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.results, [
    { id: 101, Namn: 'NSK Team 18', 'Säsong': '2026' }
  ]);
});

test('rejects missing credentials', async () => {
  const response = await readPersonallyAuthorizedTeams(request(null), {}, deps);
  assert.equal(response.status, 401);
});

test('rejects invalid session', async () => {
  const response = await readPersonallyAuthorizedTeams(request(), {}, {
    ...deps,
    verifyPersonalSession: async () => null
  });
  assert.equal(response.status, 401);
});

test('rejects missing read permission', async () => {
  const response = await readPersonallyAuthorizedTeams(request(), {}, {
    ...deps,
    verifyPersonalSession: async () => ({ ...actor, permissions: [] })
  });
  assert.equal(response.status, 403);
});

test('fails closed if trusted team source is unavailable', async () => {
  const response = await readPersonallyAuthorizedTeams(request(), {}, {
    ...deps,
    listTrustedTeams: async () => { throw Error('Unavailable'); }
  });
  assert.equal(response.status, 503);
});
