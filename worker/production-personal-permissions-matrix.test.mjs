import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizePersonalPoolWrite } from './production-pool-write-authorization.js';
import { authorizePersonalMatchWrite } from './production-match-write-authorization.js';
import { authorizeCoachSelection } from './production-coach-selection-authorization.js';

const bearer = 'x'.repeat(43);
const teams = [
  { id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' },
  { id: 19, Namn: 'NSK Testlag 2', 'Säsong': '2026' }
];
const actor = (team, permissions) => ({
  user: { id: 'tester' },
  memberships: [{ team_id: team, role: 'team_admin' }],
  permissions
});
const dependencies = identity => ({
  verifyIdentity: async token => token === bearer ? identity : null,
  listTeams: async () => teams,
  readPool: async id => ({
    id, Lag: [{ id: id === 90 ? 19 : 18 }],
    'Antal lag': 2, 'Antal matcher': 3
  }),
  readMatchConfig: async id => ({
    id, Poolspel: [{ id: id === 91 ? 90 : 12 }]
  })
});
const request = (method, path, body) => new Request('https://test.invalid' + path, {
  method,
  headers: {
    Authorization: 'Bearer ' + bearer,
    ...(body ? { 'Content-Type': 'application/json' } : {})
  },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const cases = [
  ['create pool', authorizePersonalPoolWrite, request('POST', '/api/poolspel', { name: 'Test' }), 'pool:create'],
  ['update pool', authorizePersonalPoolWrite, request('PATCH', '/api/poolspel/12', { name: 'Test' }), 'pool:create'],
  ['finish pool', authorizePersonalPoolWrite, request('PATCH', '/api/poolspel/12/aktiv', { active: false }), 'pool:finish'],
  ['reopen pool', authorizePersonalPoolWrite, request('PATCH', '/api/poolspel/12/aktiv', { active: true }), 'pool:reopen'],
  ['create match', authorizePersonalMatchWrite, request('POST', '/api/matchkonfiguration', { pool_id: 12 }), 'match:manage'],
  ['update match', authorizePersonalMatchWrite, request('PATCH', '/api/matchkonfiguration/31', { pool_id: 12 }), 'match:manage'],
  ['save lineup', authorizePersonalMatchWrite, request('POST', '/api/laguppstallningar/31', { players: [] }), 'lineup:edit'],
  ['read coach selection', authorizeCoachSelection, request('GET', '/api/coach-selection?pool_id=12&lag_no=1&match_no=1'), 'read'],
  ['save coach selection', authorizeCoachSelection, request('POST', '/api/coach-selection', { pool_id: 12, lag_no: 1, match_no: 1, coach_ids: [] }), 'lineup:edit']
];

for (const [name, authorize, req, feature] of cases) {
  test(name + ': Team 18 grant required and wrong team denied', async () => {
    const execute = identity => authorize(req, { AUTH_DB: {} }, dependencies(identity));
    assert.equal((await execute(actor('NSK Team 18', ['read', feature]))).allowed, true);
    const missing = await execute(actor('NSK Team 18', feature === 'read' ? [] : ['read']));
    assert.equal(missing.allowed, false);
    assert.equal(missing.status, 403);
    const wrong = await execute(actor('NSK Testlag 2', ['read', feature]));
    assert.equal(wrong.allowed, false);
    assert.equal(wrong.status, 403);
  });
}

test('stored ownership of Testlag 2 blocks Team 18 writes', async () => {
  const identity = actor('NSK Team 18', ['pool:create', 'match:manage']);
  const poolChange = request('PATCH', '/api/poolspel/90', { name: 'Test' });
  const matchChange = request('PATCH', '/api/matchkonfiguration/91', { pool_id: 90 });
  const poolResult = await authorizePersonalPoolWrite(poolChange, { AUTH_DB: {} }, dependencies(identity));
  const matchResult = await authorizePersonalMatchWrite(matchChange, { AUTH_DB: {} }, dependencies(identity));
  assert.equal(poolResult.status, 403);
  assert.equal(matchResult.status, 403);
});
