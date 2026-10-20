import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const script = new URL('./isolated-auth-fixture-readiness.mjs', import.meta.url);
const account = '262a0356b18defd22b05df6949c409bf';
const isolated = 'b94c8dba-34be-4cff-a4e9-892caf4e3ddd';
function run(database, accountId = account) {
  return spawnSync(process.execPath, [script.pathname], {
    encoding: 'utf8',
    timeout: 5000,
    env: {
      PATH: process.env.PATH,
      CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: 'nonsecret-test-placeholder',
      NSK_TEST_D1_DATABASE_ID: database
    }
  });
}
test('rejects production and staging D1 before any request', () => {
  for (const id of [
    '9f937bcb-b0c0-4129-af5b-775cf284dfcb',
    'b5a439d1-9e94-42eb-a8c4-5d3a0e7416f8'
  ]) {
    const result = run(id);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to inspect/);
    assert.doesNotMatch(result.stderr, /fetch failed|ECONNREFUSED/);
  }
});
test('rejects unapproved database and wrong account before any request', () => {
  for (const [id, accountId] of [
    ['00000000-0000-4000-8000-000000000000', account],
    [isolated, '00000000000000000000000000000000']
  ]) {
    const result = run(id, accountId);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Refusing to inspect/);
  }
});
test('requires credentials and isolated database selection', () => {
  const result = spawnSync(process.execPath, [script.pathname], {
    encoding: 'utf8', timeout: 5000, env: { PATH: process.env.PATH }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing Cloudflare credentials/);
});
