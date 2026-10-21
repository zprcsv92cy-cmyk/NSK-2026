import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/start-isolated-api-preview.yml', import.meta.url), 'utf8');

function assertPreviewBlocked(source) {
  const job = /^  preview:\s*\n((?: {4}.*\n|\s*\n)*)/m.exec(source)?.[1] || '';
  const guards = job.split('\n').filter(line => /^    if:\s*/.test(line));
  assert.equal(guards.length, 1, 'Preview job must have one explicit top-level disable condition');
  assert.match(guards[0], /^\s*if:\s*\$\{\{\s*inputs\.confirmation\s*==\s*'PREVIEW_ONLY'\s*&&\s*false\s*\}\}\s*$/, 'Preview dispatch must remain blocked before any steps run');
}
test('manually dispatched preview cannot launch until isolation is verified', () => {
  assertPreviewBlocked(workflow);
});
test('removing the disabled condition fails the security gate', () => {
  assert.throws(() => assertPreviewBlocked(workflow.replace(/&&\s*false/, '')), /blocked/);
});
test('moving the disable condition into a step fails the security gate', () => {
  assert.throws(() => assertPreviewBlocked(workflow.replace(/^    if:/m, '      if:')), /top-level/);
});
