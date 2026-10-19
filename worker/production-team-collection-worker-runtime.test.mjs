import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './production-api-v42-reference.js';

const origin = 'https://zprcsv92cy-cmyk.github.io';
const env = { NSK_REQUIRE_SCOPED_COLLECTION_READS: 'true' };
const request = (path, headers = {}) => new Request('https://nsk-api.example.test' + path, {
  headers: { Origin: origin, ...headers }
});

test('real Worker route rejects unauthenticated scoped collection reads before Baserow', async () => {
  for (const table of ['poolspel','matchkonfiguration','laguppstallningar','bytesschema']) {
    const response = await worker.fetch(request('/api/' + table + '?team_id=11'), env);
    assert.equal(response.status, 401, table);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  }
});

test('real Worker route rejects duplicate and missing team selectors', async () => {
  for (const path of ['/api/poolspel', '/api/poolspel?team_id=11&team_id=22']) {
    const response = await worker.fetch(request(path, {
      Authorization: 'Bearer ' + 'a'.repeat(64)
    }), env);
    assert.equal(response.status, 400, path);
  }
});

test('real Worker route rejects missing personal session dependencies without leaking data', async () => {
  const response = await worker.fetch(request('/api/poolspel?team_id=11', {
    Authorization: 'Bearer ' + 'a'.repeat(64)
  }), env);
  assert.equal(response.status, 401);
});

test('authorization header routes through guard even when rollout flag is off', async () => {
  const response = await worker.fetch(request('/api/poolspel?team_id=11', {
    Authorization: 'Bearer ' + 'a'.repeat(64)
  }), {});
  assert.equal(response.status, 401);
});
