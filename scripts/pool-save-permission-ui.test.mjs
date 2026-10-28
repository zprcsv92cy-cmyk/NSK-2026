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

test('pool page never enables saving through shared administrator credentials', () => {
  assert.doesNotMatch(page, /nsk_admin_token/);
  assert.doesNotMatch(page, /\/api\/admin\/status/);
});
