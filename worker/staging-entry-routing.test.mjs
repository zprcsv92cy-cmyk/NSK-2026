import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./staging-entry.js', import.meta.url), 'utf8');

test('all staging auth paths use the isolated dispatcher', () => {
  assert.match(source, /createStagingAuthHandler\\s*\\(/);
  assert.doesNotMatch(source, /return\\s+handleTeamAuth\\s*\\(request,\\s*env\\)/,
    'same-origin and missing-Origin requests must not bypass the staging dispatcher');
});
