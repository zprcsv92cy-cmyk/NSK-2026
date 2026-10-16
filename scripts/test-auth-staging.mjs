// Smoke tests for an isolated auth staging Worker.
// Usage: NSK_AUTH_STAGING_URL=https://nsk-auth-staging.<subdomain>.workers.dev node scripts/test-auth-staging.mjs
import assert from 'node:assert/strict';
const base = process.env.NSK_AUTH_STAGING_URL?.replace(/\/$/, '');
if (!base || !/^https:\/\//.test(base)) {
  console.error('Set NSK_AUTH_STAGING_URL to the HTTPS URL of the staging Worker.');
  process.exit(1);
}
const cases = [
  { path: '/api/auth/me', method: 'GET', expected: 401 },
  { path: '/api/auth/feature-access?team_id=NSK%20Team%2018&feature=roster', method: 'GET', expected: 401 },
  { path: '/api/auth/integration/access?team_id=NSK%20Team%2018&feature=roster', method: 'GET', expected: 401 },
  { path: '/api/auth/roster-write-check?team_id=NSK%20Team%2018', method: 'POST', expected: 401 },
  { path: '/api/auth/lineups-staging?team_id=NSK%20Testlag%202', method: 'GET', expected: 401 },
  { path: '/api/auth/lineups-staging?team_id=NSK%20Testlag%202', method: 'PATCH', body: {match_name:'Test',player_ids:[],coach_ids:[]}, expected: 401 },
  { path: '/api/auth/roster-staging?team_id=NSK%20Testlag%202', method: 'POST', body: {kind:'player',name:'Test'}, expected: 401 },

  { path: '/api/auth/lineups-staging?team_id=NSK%20Team%2018', method: 'GET', expected: 401 },
  { path: '/api/auth/lineups-staging?team_id=NSK%20Team%2018', method: 'POST', body: {match_name:'Test',player_ids:[],coach_ids:[]}, expected: 401 },
  { path: '/api/auth/integration/roster?team_id=NSK%20Team%2018', method: 'GET', expected: 401 },
  { path: '/api/auth/integration/roster?team_id=NSK%20Testlag%202', method: 'GET', expected: 401 },
  { path: '/api/auth/integration/roster?team_id=NSK%20Team%2018', method: 'POST', expected: 401 },
  { path: '/api/auth/users', method: 'GET', expected: 403 },
  { path: '/api/auth/users', method: 'POST', body: {name:'Test',email:'test@example.invalid'}, expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000', method: 'PATCH', body: {name:'Test',email:'test@example.invalid'}, expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000', method: 'DELETE', expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000/permissions', method: 'PUT', body: {permissions:['read']}, expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000/setup-token', method: 'POST', expected: 403 },
  { path: '/api/auth/activate', method: 'POST', body: {token:'invalid',password:'invalid'}, expected: 400 },
  { path: '/api/auth/roster-staging?team_id=NSK%20Team%2018', method: 'GET', expected: 401 },
  { path: '/api/auth/roster-staging?team_id=NSK%20Testlag%202', method: 'GET', expected: 401 },
  { path: '/api/auth/team-members', method: 'GET', expected: 403 },
  { path: '/api/auth/team-members', method: 'PUT', body: {user_id:'00000000-0000-4000-8000-000000000000',team_id:'NSK Testlag 2',role:'team_admin'}, expected: 403 },
  { path: '/api/auth/staging/add-second-team', method: 'POST', expected: 404 },
  { path: '/api/auth/roster-staging', method: 'POST', body: {kind:'player',name:'Test'}, expected: 401 },
  { path: '/api/auth/logout', method: 'POST', expected: 200 },
  { path: '/api/auth/login', method: 'POST', body: { email: 'nonexistent@example.invalid', password: 'not-a-valid-password' }, expected: 401 },
  { path: '/api/auth/login', method: 'POST', body: '{', raw: true, expected: 400 },
  { path: '/api/auth/login', method: 'POST', body: 'null', raw: true, expected: 400 },
  { path: '/api/auth/login', method: 'POST', body: '[]', raw: true, expected: 400 },
  { path: '/api/unknown', method: 'GET', expected: 404 }
];
for (const item of cases) {
  const response = await fetch(base + item.path, {
    method: item.method,
    headers: item.body !== undefined ? { 'content-type': 'application/json' } : {},
    body: item.body !== undefined ? (item.raw ? item.body : JSON.stringify(item.body)) : undefined
  });
  const text = await response.text();
  assert.equal(response.status, item.expected, `${item.method} ${item.path} payload=${JSON.stringify(item.body ?? null)}: ${text}`);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  console.log('PASS', item.method, item.path, response.status);
}
console.log('All unauthenticated staging smoke tests passed.');
// The obsolete staging fixture must be absent (404), not merely inaccessible (403).

const page = await fetch(base + '/aktivera/');
assert.equal(page.status, 200, 'Activation page status');
assert.match(page.headers.get('content-type') || '', /text\/html/);
assert.match(await page.text(), /Aktivera konto/);
console.log('PASS GET /aktivera/ 200');

const lineupPage = await fetch(base + '/laguppstallning/');
assert.equal(lineupPage.status, 200, 'Lineup staging page status');
assert.match(lineupPage.headers.get('content-type') || '', /text\/html/);
const lineupHtml = await lineupPage.text();
assert.match(lineupHtml, /TESTMILJÖ/);
assert.match(lineupHtml, /api\/auth\/integration\/roster/);
assert.match(lineupHtml, /lineup:edit/);
console.log('PASS GET /laguppstallning/ 200');


const approvedOrigin = 'https://zprcsv92cy-cmyk.github.io';
const disallowedOrigin = 'https://untrusted.example';
for (const [label, origin, expectedOrigin] of [
  ['approved', approvedOrigin, approvedOrigin],
  ['disallowed', disallowedOrigin, null],
  ['missing', null, null]
]) {
  for (const path of [
    '/api/auth/roster-staging?team_id=NSK%20Team%2018',
    '/api/auth/roster-staging?team_id=NSK%20Testlag%202'
  ]) {
    const headers = origin ? { Origin: origin } : {};
    const response = await fetch(base + path, { headers });
    assert.equal(response.status, 401, label + ' origin must not bypass roster authorization');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), expectedOrigin);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Vary'), 'Origin');
    console.log('PASS roster origin', label, path);
  }
}
for (const origin of [approvedOrigin, disallowedOrigin]) {
  const response = await fetch(base + '/api/auth/roster-staging', {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'Authorization, Content-Type'
    }
  });
  assert.equal(response.status, origin === approvedOrigin ? 204 : 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),
    origin === approvedOrigin ? approvedOrigin : null);
  console.log('PASS roster preflight', origin, response.status);
}

const protectedWrites = [
  { path: '/api/auth/roster-staging?team_id=NSK%20Team%2018', method: 'POST',
    body: { kind: 'player', name: 'MUST NOT BE CREATED' } },
  { path: '/api/auth/roster-staging/123e4567-e89b-12d3-a456-426614174000?team_id=NSK%20Team%2018',
    method: 'PATCH', body: { name: 'MUST NOT BE UPDATED' } },
  { path: '/api/auth/roster-staging/123e4567-e89b-12d3-a456-426614174000?team_id=NSK%20Team%2018',
    method: 'DELETE' }
];
for (const item of protectedWrites) {
  const response = await fetch(base + item.path, {
    method: item.method,
    headers: item.body ? { 'content-type': 'application/json' } : {},
    body: item.body ? JSON.stringify(item.body) : undefined
  });
  assert.equal(response.status, 401, item.method + ' must require personal authentication');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  console.log('PASS unauthenticated roster mutation blocked', item.method);
}
