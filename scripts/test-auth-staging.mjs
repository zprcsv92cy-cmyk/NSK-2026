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
  { path: '/api/auth/users', method: 'GET', expected: 403 },
  { path: '/api/auth/users', method: 'POST', body: {name:'Test',email:'test@example.invalid'}, expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000', method: 'PATCH', body: {name:'Test',email:'test@example.invalid'}, expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000', method: 'DELETE', expected: 403 },
  { path: '/api/auth/users/00000000-0000-4000-8000-000000000000/permissions', method: 'PUT', body: {permissions:['read']}, expected: 403 },
  { path: '/api/auth/logout', method: 'POST', expected: 200 },
  { path: '/api/auth/login', method: 'POST', body: { email: 'nonexistent@example.invalid', password: 'not-a-valid-password' }, expected: 401 },
  { path: '/api/auth/login', method: 'POST', body: '{', raw: true, expected: 400 },
  { path: '/api/unknown', method: 'GET', expected: 404 }
];
for (const item of cases) {
  const response = await fetch(base + item.path, {
    method: item.method,
    headers: item.body ? { 'content-type': 'application/json' } : {},
    body: item.body ? (item.raw ? item.body : JSON.stringify(item.body)) : undefined
  });
  const text = await response.text();
  assert.equal(response.status, item.expected, item.path + ': ' + text);
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  console.log('PASS', item.method, item.path, response.status);
}
console.log('All unauthenticated staging smoke tests passed.');
