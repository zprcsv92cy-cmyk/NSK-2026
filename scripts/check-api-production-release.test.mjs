import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
test('incomplete production API manifest cannot pass deployment preflight', () => {
  const result = spawnSync(process.execPath, ['scripts/check-api-production-release.mjs'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /deployment BLOCKED/);
  assert.doesNotMatch(result.stderr, /Missing Worker main entrypoint/);
  assert.doesNotMatch(result.stderr, /ADMIN_KV KV namespace missing/);
  assert.match(result.stderr, /Explicit production release approval missing/);
  assert.doesNotMatch(result.stderr, /NSK_TRAINERS KV namespace missing/);
  assert.doesNotMatch(result.stderr, /SHIFT_LOCK Durable Object binding missing/);
  assert.match(result.stderr, /Explicit production release approval missing/);
});

test('approval flag alone cannot bypass missing production bindings', () => {
  const result = spawnSync(process.execPath, ['scripts/check-api-production-release.mjs'], {
    encoding: 'utf8', env: { ...process.env, NSK_API_PRODUCTION_RELEASE_APPROVED: 'yes' }
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Live production checks and rollback verification missing/);
  assert.doesNotMatch(result.stderr, /SHIFT_LOCK Durable Object binding missing/);
  assert.doesNotMatch(result.stderr, /Explicit production release approval missing/);
});
