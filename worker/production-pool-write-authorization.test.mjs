import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { authorizePersonalPoolWrite } from './production-pool-write-authorization.js';

const teams = [
  { id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' },
  { id: 19, Namn: 'NSK Testlag 2', 'Säsong': '2026' }
];
const actor = (team = 'NSK Team 18', permissions = ['pool:create','pool:finish','pool:reopen']) => ({
  user: { id: 'user-1' },
  memberships: [{ team_id: team, role: 'team_admin' }],
  permissions
});
const request = (method, path, body, token = 'a'.repeat(43)) => new Request('https://nsk-api.example' + path, {
  method,
  headers: { Authorization: token ? 'Bearer ' + token : '', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const setup = ({ identity = actor(), pool = { id: 42, Lag: [{ id: 18 }] }, teamList = teams } = {}) => {
  const calls = { teamLists: 0, poolReads: [] };
  return {
    calls,
    options: {
      listTeams: async () => { calls.teamLists++; return teamList; },
      readPool: async id => { calls.poolReads.push(id); return pool; },
      verifyIdentity: async token => token === 'a'.repeat(43) ? identity : null
    }
  };
};

test('pool creation requires a verified session, Team 18 membership, and pool:create', async () => {
  const x = setup();
  const result = await authorizePersonalPoolWrite(request('POST', '/api/poolspel', { title: 'Test' }, null),
    { AUTH_DB: {} }, x.options);
  assert.equal(result.status, 401);
  const allowed = await authorizePersonalPoolWrite(request('POST', '/api/poolspel', { title: 'Test' }),
    { AUTH_DB: {} }, x.options);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.teamId, 'NSK Team 18');
  assert.equal(allowed.feature, 'pool');
});

test('pool update derives its team from the persisted pool row, not client input', async () => {
  const x = setup({ pool: { id: 42, Lag: [{ id: 19 }] } });
  const result = await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42', { title: 'changed', team_id: 'NSK Team 18' }),
    { AUTH_DB: {} }, x.options);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
  assert.deepEqual(x.calls.poolReads, [42]);
});

test('pool finish and reopen require their separate feature grants', async () => {
  const x = setup({ identity: actor('NSK Team 18', ['pool:finish']) });
  const finish = await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42/aktiv', { active: false }),
    { AUTH_DB: {} }, x.options);
  assert.equal(finish.allowed, true);
  assert.equal(finish.feature, 'pool_finish');
  const reopen = await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42/aktiv', { active: true }),
    { AUTH_DB: {} }, x.options);
  assert.equal(reopen.allowed, false);
  assert.equal(reopen.status, 403);
});

test('membership without an explicit pool grant is denied', async () => {
  const x = setup({ identity: actor('NSK Team 18', ['read']) });
  const result = await authorizePersonalPoolWrite(request('POST', '/api/poolspel', { title: 'Test' }),
    { AUTH_DB: {} }, x.options);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('pool owner lookup fails closed for missing, ambiguous, or unmapped pools', async () => {
  const missing = setup({ pool: null });
  assert.equal((await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42', {}),
    { AUTH_DB: {} }, missing.options)).status, 404);
  const ambiguous = setup({ pool: { id: 42, Lag: [{ id: 18 }, { id: 19 }] } });
  assert.equal((await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42', {}),
    { AUTH_DB: {} }, ambiguous.options)).status, 503);
  const unmapped = setup({ pool: { id: 42, Lag: [{ id: 999 }] } });
  assert.equal((await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42', {}),
    { AUTH_DB: {} }, unmapped.options)).status, 503);
});

test('malformed toggle payload and unsupported routes are rejected before identity lookup', async () => {
  const x = setup();
  assert.equal((await authorizePersonalPoolWrite(request('PATCH', '/api/poolspel/42/aktiv', { active: 'false' }),
    { AUTH_DB: {} }, x.options)).status, 400);
  assert.equal((await authorizePersonalPoolWrite(request('POST', '/api/poolspel/42', {}),
    { AUTH_DB: {} }, x.options)).status, 404);
});
