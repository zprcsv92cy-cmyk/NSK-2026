import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const authSource = readFileSync(new URL('../auth.js', import.meta.url), 'utf8');

async function makeAuth(identity) {
  const storage = new Map([
    ['nsk_user_token', 'valid-session-token'],
    ['nsk_active_team', identity.memberships[0]?.team_id || '']
  ]);
  const sessionStorage = {
    getItem: key => storage.has(key) ? storage.get(key) : null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key)
  };
  const window = { APP_CONFIG: { AUTH_URL: 'https://auth.example.test' } };
  runInNewContext(authSource, {
    window,
    sessionStorage,
    URLSearchParams,
    fetch: async () => ({ ok: true, json: async () => identity })
  });
  await window.Auth.init();
  return window.Auth;
}

test('canonical feature grants map from UI aliases and require team membership', async () => {
  const auth = await makeAuth({
    user: { id: 'user-1', name: 'Tester' },
    memberships: [{ team_id: 'team-18', role: 'team_admin' }],
    permissions: ['read', 'pool:create', 'lineup:edit', 'shifts:check', 'match:manage',
      'pool:finish', 'pool:reopen', 'roster:manage', 'users:manage']
  });
  for (const feature of ['read', 'pool', 'lineup', 'shifts', 'matches', 'pool_finish',
    'pool_reopen', 'roster', 'users']) {
    assert.equal(auth.can(feature, 'team-18'), true, feature);
  }
  assert.equal(auth.can('pool:create', 'team-18'), true);
  assert.equal(auth.can('pool', 'team-2'), false);
});

test('UI hints honor coach grants while keeping viewers read-only', async () => {
  const coach = await makeAuth({
    user: { id: 'coach-1', name: 'Coach' },
    memberships: [{ team_id: 'team-18', role: 'coach' }],
    permissions: ['read', 'lineup:edit', 'roster:manage']
  });
  assert.equal(coach.can('read', 'team-18'), true);
  assert.equal(coach.can('lineup', 'team-18'), true);
  assert.equal(coach.can('roster', 'team-18'), true);

  const viewer = await makeAuth({
    user: { id: 'viewer-1', name: 'Viewer' },
    memberships: [{ team_id: 'team-18', role: 'viewer' }],
    permissions: ['read', 'roster:manage']
  });
  assert.equal(viewer.can('read', 'team-18'), true);
  assert.equal(viewer.can('roster', 'team-18'), false);
});

test('global-admin UI hint still requires team membership, a grant, and a non-viewer role', async () => {
  const globalAdmin = await makeAuth({
    user: { id: 'global-1', name: 'Global admin' },
    is_global_admin: true,
    memberships: [{ team_id: 'team-18', role: 'coach' }],
    permissions: ['read', 'match:manage']
  });
  assert.equal(globalAdmin.can('matches', 'team-18'), true);
  assert.equal(globalAdmin.can('matches', 'team-2'), false);
  assert.equal(globalAdmin.can('roster', 'team-18'), false);

  const viewer = await makeAuth({
    user: { id: 'global-viewer', name: 'Viewer' },
    is_global_admin: true,
    memberships: [{ team_id: 'team-18', role: 'viewer' }],
    permissions: ['read', 'roster:manage']
  });
  assert.equal(viewer.can('roster', 'team-18'), false);
});


test('legacy roster UI stays disabled outside Team 18 even with an admin token', () => {
  const html = readFileSync(new URL('../truppen/index.html', import.meta.url), 'utf8');
  const legacy = html.split("const token = localStorage.getItem('nsk_admin_token');")[0];
  assert.match(legacy, /if \(window\.Auth\?\.activeTeam\?\.\(\) !== 'NSK Team 18'\) return false;/);
});


test('UI decisions match the shared API policy for every feature and delegated role', async () => {
  const {authorizeTeamFeature,FEATURE_PERMISSIONS}=await import('./team-authorization-policy.js');
  for(const role of ['owner','team_admin','coach','team_manager','fitness','equipment','player','viewer','invalid']){
    const identity={user:{id:'synthetic-user'},memberships:[{team_id:'team-18',role}],permissions:['read',...Object.values(FEATURE_PERMISSIONS),'unexpected']};
    const auth=await makeAuth(identity);
    for(const feature of Object.keys(FEATURE_PERMISSIONS))assert.equal(auth.can(feature,'team-18'),authorizeTeamFeature(identity,'team-18',feature).allowed,role+' '+feature);
    assert.equal(auth.can('roster','foreign'),false);assert.equal(auth.can('unexpected','team-18'),false);
  }
});
