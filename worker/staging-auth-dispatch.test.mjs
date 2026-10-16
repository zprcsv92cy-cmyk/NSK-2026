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
