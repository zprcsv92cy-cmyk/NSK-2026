import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../skapapoolspel/index.html', import.meta.url), 'utf8');

test('pool save button uses server-confirmed personal permission when rollout is enabled', () => {
  assert.match(page, /REQUIRE_PERSONAL_POOL_WRITES===true/);
  assert.match(page, /Auth\?\.checkTeamFeature\?\.\('pool',team\)/);
  assert.match(page, /btn\.hidden=!allowed;btn\.disabled=!allowed/);
  assert.match(page, /Auth\?\.activeTeam\?\.\(\)/);
});

test('legacy pool save behavior is preserved while rollout is disabled', () => {
  assert.match(page, /localStorage\.getItem\('nsk_admin_token'\)/);
  assert.match(page, /\/api\/admin\/status/);
});
