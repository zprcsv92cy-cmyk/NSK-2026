import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dispatchStagingAuth } from './staging-auth-dispatch.js';

const root = 'https://staging.example/api/auth/';
const site = 'https://zprcsv92cy-cmyk.github.io';
test('approved origin receives scoped CORS preflight', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'roster-staging', {
    method: 'OPTIONS', headers: { Origin: site }
  }), {}, () => { throw Error('preflight must not authenticate'); });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), site);
  assert.match(response.headers.get('Access-Control-Allow-Headers'), /Authorization/);
});
test('unknown origin cannot preflight protected API', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'roster-staging', {
    method: 'OPTIONS', headers: { Origin: 'https://evil.example' }
  }), {}, async () => new Response('unexpected'));
  assert.equal(response.status, 403);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
});
test('roster request never falls back to legacy team auth', async () => {
  let fallback = 0;
  const response = await dispatchStagingAuth(new Request(root + 'roster-staging?team_id=team-18', {
    headers: { Origin: site }
  }), { AUTH_DB: {} }, async () => { fallback++; return new Response('legacy'); });
  assert.equal(response.status, 401);
  assert.equal(fallback, 0);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), site);
});
test('other auth routes continue through existing handler', async () => {
  let fallback = 0;
  const response = await dispatchStagingAuth(new Request(root + 'me', {
    headers: { Origin: site }
  }), {}, async () => { fallback++; return new Response('existing'); });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'existing');
  assert.equal(fallback, 1);
});
test('missing auth handler fails closed', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'me'), {});
  assert.equal(response.status, 503);
});

test('roster rejects missing personal token even without legacy handler', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'roster-staging?team_id=team-18'), {
    AUTH_DB: {}
  });
  assert.equal(response.status, 401);
});
test('roster denies access if staging database is not configured', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'roster-staging?team_id=team-18'));
  assert.equal(response.status, 503);
});

test('staging API failure preserves approved origin CORS and no-store', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'me', {
    headers: { Origin: site }
  }), {}, async () => { throw Error('database offline'); });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), site);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Vary'), 'Origin');
  assert.equal((await response.json()).error, 'Stagingtjänsten är tillfälligt otillgänglig');
});
test('staging API failure never grants CORS to unknown origins', async () => {
  const response = await dispatchStagingAuth(new Request(root + 'me', {
    headers: { Origin: 'https://evil.example' }
  }), {}, async () => { throw Error('database offline'); });
  assert.equal(response.status, 503);
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
});

test('legacy wildcard CORS cannot override staging origin restriction', async () => {
  const legacy = async () => new Response('ok', { headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Expose-Headers': 'X-Secret'
  } });
  const denied = await dispatchStagingAuth(new Request(root + 'me', {
    headers: { Origin: 'https://evil.example' }
  }), {}, legacy);
  assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  assert.equal(denied.headers.has('Access-Control-Allow-Credentials'), false);
  assert.equal(denied.headers.has('Access-Control-Expose-Headers'), false);
  const approved = await dispatchStagingAuth(new Request(root + 'me', {
    headers: { Origin: site }
  }), {}, legacy);
  assert.equal(approved.headers.get('Access-Control-Allow-Origin'), site);
});

test('entrypoint adapter preserves activation and bootstrap routes', async () => {
  const { createStagingAuthHandler } = await import('./staging-auth-dispatch.js');
  const calls = [];
  const adapter = createStagingAuthHandler({
    handleTeamAuth: async () => { calls.push('auth'); return new Response('auth'); },
    handleActivation: async () => { calls.push('activation'); return new Response('activation'); },
    bootstrapTestAccount: async () => { calls.push('bootstrap'); return new Response('bootstrap'); }
  });
  for (const [path, expected] of [
    ['activate', 'activation'],
    ['staging/bootstrap-test', 'bootstrap'],
    ['me', 'auth']
  ]) {
    const response = await adapter(new Request(root + path), {});
    assert.equal(await response.text(), expected);
  }
  assert.deepEqual(calls, ['activation', 'bootstrap', 'auth']);
});
