import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import worker, { ShiftLock } from './production-api-v42-reference.js';

const legacy = [1255083,1255098,1255100,1255101,1255109,1255113,1255115,1255119,1255152,1255157];
const names = ['lag','spelare','tranare','poolspel','matcher','laguppstallningar','bytesschema','malvaktsstatistik','spelaretranare','matchkonfiguration'];
const isolated = Object.fromEntries(names.map((name, i) => [name, 990001 + i]));
const get = (env) => worker.fetch(new Request('https://nsk.test/api/lag'), env);

test('rejects incomplete isolated Baserow configuration before any network request', async () => {
  for (const config of ['{}', 'not-json', JSON.stringify({ ...isolated, lag: 0 }), JSON.stringify({ ...isolated, extra: 4 }), JSON.stringify({ ...isolated, lag: 1255083 }), JSON.stringify({ ...isolated, poolspel: 1255101 }), JSON.stringify({ ...isolated, lag: isolated.spelare })]) {
    const response = await get({ BASEROW_TABLE_IDS: config, BASEROW_TOKEN: 'fake' });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Invalid Baserow table mapping/);
  }
});

test('isolated Baserow read uses configured Lag table, never production table', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return Response.json({ results: [], count: 0, next: null, previous: null });
  };
  try {
    const response = await get({ BASEROW_TABLE_IDS: JSON.stringify(isolated), BASEROW_TOKEN: 'fake' });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0], /table\/990001\//);
    for (const id of legacy) assert.doesNotMatch(calls[0], new RegExp('table/' + id + '/'));
  } finally { globalThis.fetch = original; }
});

test('ShiftLock refuses incomplete isolated mapping before any Baserow write', async () => {
  const lock = new ShiftLock({}, { BASEROW_TABLE_IDS: '{}', BASEROW_TOKEN: 'fake' });
  const response = await lock.save({ pool_id: 12, lag_no: 1, match_no: 1, shifts: [] });
  assert.equal(response.status, 503);
});

test('isolated preview mode requires separate Baserow mapping, token and database', async () => {
  for (const env of [
    { NSK_ISOLATED_MODE: 'true' },
    { NSK_ISOLATED_MODE: 'true', BASEROW_TABLE_IDS: '' },
    { NSK_ISOLATED_MODE: 'true', BASEROW_TABLE_IDS: JSON.stringify(isolated) },
    { NSK_ISOLATED_MODE: 'true', BASEROW_TABLE_IDS: JSON.stringify(isolated), BASEROW_TOKEN: 'fake' },
    { NSK_ISOLATED_MODE: 'true', BASEROW_TABLE_IDS: JSON.stringify(isolated), BASEROW_DATABASE_ID: 'test' }
  ]) {
    const response = await get(env);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Invalid Baserow table mapping/);
  }
});
