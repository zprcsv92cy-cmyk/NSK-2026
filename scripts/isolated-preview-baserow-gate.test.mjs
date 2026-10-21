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

test('incomplete preview manifest is blocked until isolated Baserow is provisioned', () => {
  const incomplete = valid().replace(/^BASEROW_DATABASE_ID.*\\n/m, '');
  assert.throws(() => verifyIsolatedBaserowManifest(incomplete), /BASEROW_DATABASE_ID/);
});
test('preview manifest does not embed a Baserow credential', () => {
  const existing = readFileSync(new URL('../wrangler.api.preview.toml', import.meta.url), 'utf8');
  assert.doesNotMatch(existing, /^\\s*BASEROW_TOKEN\\s*=/m);
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

test('table IDs must be positive safe JSON integers, never numeric strings', () => {
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', { ...mapping, lag: '990001' })), /positive safe integer/);
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', { ...mapping, lag: 9007199254740992 })), /positive safe integer/);
  assert.throws(() => verifyIsolatedBaserowManifest(valid('990000', { ...mapping, lag: 0 })), /positive safe integer/);
});
test('the production Baserow database identifier comes from the production manifest', () => {
  const production = readFileSync(new URL('../wrangler.api.production.toml', import.meta.url), 'utf8');
  const id = /^BASEROW_DATABASE_ID\s*=\s*"([1-9]\d*)"\s*$/m.exec(production)?.[1];
  assert.ok(id, 'Production Baserow ID must be extractable');
  assert.throws(() => verifyIsolatedBaserowManifest(valid(id)), /Production Baserow database/);
});
