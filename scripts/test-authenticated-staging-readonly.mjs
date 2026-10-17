// Read-only live tests for two separately authenticated staging accounts.
// Supply SHORT-LIVED bearer session tokens as environment variables; never commit tokens.
// Does not write, create, patch or delete data, or print account details.
import assert from 'node:assert/strict';

const base = (process.env.NSK_AUTH_STAGING_URL || '').replace(/\/$/, '');
const adminToken = process.env.NSK_STAGING_ADMIN_TOKEN;
const viewerToken = process.env.NSK_STAGING_VIEWER_TOKEN;
assert.match(base, /^https:\/\//, 'NSK_AUTH_STAGING_URL must be an HTTPS staging URL');
assert.ok(adminToken && viewerToken, 'Two staging session tokens are required; authenticated verification was NOT run');
assert.notEqual(adminToken, viewerToken, 'Distinct accounts are required for a cross-team test');

async function get(path, token) {
  const response = await fetch(base + path, {
    headers: { Authorization: 'Bearer ' + token },
    redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  assert.equal(response.headers.get('cache-control'), 'no-store', 'No caching of team data');
  return response;
}

const team18 = 'NSK Team 18', testlag2 = 'NSK Testlag 2';
const expected = [
  { label: 'Team 18 administrator', token: adminToken, own: team18, foreign: testlag2, role: 'team_admin' },
  { label: 'Testlag 2 viewer', token: viewerToken, own: testlag2, foreign: team18, role: 'viewer' }
];
for (const actor of expected) {
  const me = await get('/api/auth/me', actor.token);
  assert.equal(me.status, 200, actor.label + ' must have a valid session');
  const identity = await me.json();
  assert.ok(identity.user?.id, 'Identity must include a personal user ID');
  assert.ok(identity.memberships?.some(x => x.team_id === actor.own && x.role === actor.role),
    actor.label + ' must have the expected team role');

  for (const path of ['/api/auth/roster-staging', '/api/auth/lineups-staging']) {
    const own = await get(path + '?team_id=' + encodeURIComponent(actor.own), actor.token);
    assert.equal(own.status, 200, actor.label + ' must be able to READ own team');
    const foreign = await get(path + '?team_id=' + encodeURIComponent(actor.foreign), actor.token);
    assert.equal(foreign.status, 403, actor.label + ' must NOT read another team');
  }
  const access = await get('/api/auth/feature-access?team_id=' + encodeURIComponent(actor.own) + '&feature=roster', actor.token);
  assert.equal(access.status, 200);
  const decision = await access.json();
  assert.equal(decision.allowed, actor.role === 'team_admin', 'Role-based editing decision');
  console.log('PASS read-only authenticated role and team isolation:', actor.label);
}
console.log('PASS authenticated live staging checks (no writes)');
