import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyIsolatedBaserowManifest } from './isolated-preview-baserow-gate.mjs';

const names = ['lag','spelare','tranare','poolspel','matcher','laguppstallningar','bytesschema','malvaktsstatistik','spelaretranare','matchkonfiguration'];
const mapping = Object.fromEntries(names.map((name, i) => [name, 990001 + i]));
const valid = (database = '990000', tables = mapping) => [
  '[previews.vars]',
  'NSK_ISOLATED_MODE = "true"',
  'BASEROW_DATABASE_ID = "' + database + '"',
  'BASEROW_TABLE_IDS = "' + JSON.stringify(tables).replace(/"/g, '\\"') + '"',
  '',
  '[[previews.d1_databases]]',
  'binding = "AUTH_DB"'
].join('\n');

test('current preview manifest is blocked until isolated Baserow is provisioned', () => {
  const existing = readFileSync(new URL('../wrangler.api.preview.toml', import.meta.url), 'utf8');
  assert.throws(() => verifyIsolatedBaserowManifest(existing), /BASEROW_DATABASE_ID/);
});
test('complete synthetic mapping passes the static gate', () => {
  assert.deepEqual(verifyIsolatedBaserowManifest(valid()), { databaseId: '990000', tableCount: 10 });
});
test('production database ID is rejected', () => {
  assert.throws(() => verifyIsolatedBaserowManifest(valid('589073')), /Production Baserow database/);
});
test('production table IDs are rejected', () => {
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', { ...mapping, lag: 1255083 })), /Production Baserow table/);
});
test('missing, duplicate and malformed Baserow table assignments are rejected', () => {
  const missing = { ...mapping }; delete missing.lag;
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', missing)));
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', { ...mapping, lag: mapping.spelare })), /distinct/);
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', { ...mapping, lag: 'oops' })));
});
test('isolated-mode flag is required', () => {
  assert.throws(() => verifyIsolatedBaserowManifest(valid().replace('NSK_ISOLATED_MODE = "true"', 'NSK_ISOLATED_MODE = "false"')));
});
