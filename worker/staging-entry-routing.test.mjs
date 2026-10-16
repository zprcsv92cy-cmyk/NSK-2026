import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./staging-entry.js', import.meta.url), 'utf8');

test('all staging auth paths use the isolated dispatcher', () => {
  assert.ok(source.includes('createStagingAuthHandler('));
  assert.ok(!source.includes('return handleTeamAuth(request, env)'),
    'same-origin and missing-Origin requests must not bypass the staging dispatcher');
});
