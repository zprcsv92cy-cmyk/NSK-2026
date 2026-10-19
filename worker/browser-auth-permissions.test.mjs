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

test('UI hints mirror server role ceilings while honoring explicit grants', async () => {
  const coach = await makeAuth({
    user: { id: 'coach-1', name: 'Coach' },
    memberships: [{ team_id: 'team-18', role: 'coach' }],
    permissions: ['read', 'lineup:edit', 'roster:manage']
  });
  assert.equal(coach.can('read', 'team-18'), true);
  assert.equal(coach.can('lineup', 'team-18'), true);
  assert.equal(coach.can('roster', 'team-18'), false);

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
