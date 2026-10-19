import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { authorizePersonalMatchWrite } from './production-match-write-authorization.js';

const teams = [
  { id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' },
  { id: 19, Namn: 'NSK Testlag 2', 'Säsong': '2026' }
];
const actor = (team = 'NSK Team 18', permissions = ['match:manage','lineup:edit']) => ({
  user: { id: 'user-1' },
  memberships: [{ team_id: team, role: 'team_admin' }],
  permissions
});
const request = (method, path, body, token = 'a'.repeat(43)) => new Request('https://nsk-api.example' + path, {
  method,
  headers: { Authorization: token ? 'Bearer ' + token : '', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
});
const setup = ({ identity = actor(), pool = { id: 42, Lag: [{ id: 18 }] },
  config = { id: 7, Poolspel: [{ id: 42 }] }, teamList = teams } = {}) => {
  const calls = { pools: [], configs: [], teamLists: 0 };
  return {
    calls,
    options: {
      listTeams: async () => { calls.teamLists++; return teamList; },
      readPool: async id => { calls.pools.push(id); return pool; },
      readMatchConfig: async id => { calls.configs.push(id); return config; },
      verifyIdentity: async token => token === 'a'.repeat(43) ? identity : null
    }
  };
};

test('new match configuration requires a personal session, membership and match:manage', async () => {
  const x = setup();
  const result = await authorizePersonalMatchWrite(request('POST', '/api/matchkonfiguration', {
    pool_id: 42, lag_no: 1, match_no: 1
  }, null), { AUTH_DB: {} }, x.options);
  assert.equal(result.status, 401);
  const allowed = await authorizePersonalMatchWrite(request('POST', '/api/matchkonfiguration', {
    pool_id: 42, lag_no: 1, match_no: 1
  }), { AUTH_DB: {} }, x.options);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.feature, 'matches');
  assert.deepEqual(x.calls.pools, [42]);
});

test('match configuration update resolves its pool from the persisted row', async () => {
  const x = setup();
  const result = await authorizePersonalMatchWrite(request('PATCH', '/api/matchkonfiguration/7', {
    pool_id: 999, team_id: 'NSK Testlag 2'
  }), { AUTH_DB: {} }, x.options);
  assert.equal(result.allowed, true);
  assert.deepEqual(x.calls.configs, [7]);
  assert.deepEqual(x.calls.pools, [42]);
});

test('lineup write requires lineup:edit and derives ownership from stored match configuration', async () => {
  const x = setup({ identity: actor('NSK Team 18', ['lineup:edit']) });
  const allowed = await authorizePersonalMatchWrite(request('POST', '/api/laguppstallningar/7', {
    players: [101], coaches: [202], team_id: 'NSK Testlag 2'
  }), { AUTH_DB: {} }, x.options);
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.feature, 'lineup');
  assert.deepEqual(x.calls.configs, [7]);
  assert.deepEqual(x.calls.pools, [42]);
});

test('membership without the relevant grant is denied', async () => {
  const x = setup({ identity: actor('NSK Team 18', ['read']) });
  const result = await authorizePersonalMatchWrite(request('POST', '/api/matchkonfiguration', {
    pool_id: 42, lag_no: 1, match_no: 1
  }), { AUTH_DB: {} }, x.options);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('cross-team writes are denied even if request body names another team', async () => {
  const x = setup({ pool: { id: 42, Lag: [{ id: 19 }] } });
  const result = await authorizePersonalMatchWrite(request('POST', '/api/matchkonfiguration', {
    pool_id: 42, lag_no: 1, match_no: 1, team_id: 'NSK Team 18'
  }), { AUTH_DB: {} }, x.options);
  assert.equal(result.allowed, false);
  assert.equal(result.status, 403);
});

test('ambiguous pool ownership and missing match configuration fail closed', async () => {
  const ambiguous = setup({ pool: { id: 42, Lag: [{ id: 18 }, { id: 19 }] } });
  assert.equal((await authorizePersonalMatchWrite(request('POST', '/api/matchkonfiguration', {
    pool_id: 42, lag_no: 1, match_no: 1
  }), { AUTH_DB: {} }, ambiguous.options)).status, 503);
  const missing = setup({ config: null });
  assert.equal((await authorizePersonalMatchWrite(request('PATCH', '/api/matchkonfiguration/7', {}),
    { AUTH_DB: {} }, missing.options)).status, 404);
});
