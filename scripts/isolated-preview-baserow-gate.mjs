import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Fail closed before any Cloudflare API call or Wrangler preview operation.
// This static check is NOT proof that secrets, accounts, or D1/KV are isolated.
export function verifyIsolatedBaserowManifest(source) {
  const section = /^\[previews\.vars\]([^]*?)(?=^\[|$(?![\s\S]))/m.exec(source)?.[1] || '';
  const field = name => {
    const lines = section.split('\n').filter(line => new RegExp('^\\s*' + name + '\\s*=').test(line));
    assert.equal(lines.length, 1, 'Preview requires one explicit ' + name + ' in [previews.vars]');
    const value = /^\s*\w+\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(lines[0]);
    assert.ok(value, name + ' must be a quoted TOML string');
    return value[1];
  };
  assert.equal(field('NSK_ISOLATED_MODE'), 'true', 'Isolated mode must be enabled');
  const databaseId = field('BASEROW_DATABASE_ID');
  assert.match(databaseId, /^[1-9]\d*$/, 'Baserow database ID must be numeric');
  assert.notEqual(databaseId, '589073', 'Production Baserow database is forbidden');
  const raw = field('BASEROW_TABLE_IDS');
  let mapping;
  try { mapping = JSON.parse(raw.replace(/\\"/g, '"')); }
  catch { throw Error('Baserow table mapping must be valid JSON'); }
  const expected = ['lag','spelare','tranare','poolspel','matcher','laguppstallningar','bytesschema','malvaktsstatistik','spelaretranare','matchkonfiguration'];
  assert.deepEqual(Object.keys(mapping).sort(), expected.sort(), 'Baserow mapping must contain exactly ten tables');
  const ids = expected.map(name => String(mapping[name]));
  for (const id of ids) assert.match(id, /^[1-9]\d*$/, 'Every table ID must be a positive integer');
  assert.equal(new Set(ids).size, expected.length, 'Baserow table IDs must be distinct');
  const productionIds = new Set(['1255083','1255098','1255100','1255101','1255109','1255113','1255115','1255119','1255152','1255157']);
  for (const id of ids) assert.ok(!productionIds.has(id), 'Production Baserow table ID is forbidden');
  return { databaseId, tableCount: ids.length };
}

if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  const source = readFileSync(new URL('../wrangler.api.preview.toml', import.meta.url), 'utf8');
  verifyIsolatedBaserowManifest(source);
  console.log('Static isolated Baserow manifest check passed. External resources and token scope still require verification.');
}
