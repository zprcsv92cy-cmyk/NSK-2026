import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const worker = readFileSync(new URL('./production-api-v42-reference.js', import.meta.url), 'utf8');
const frontend = readFileSync(new URL('../db.js', import.meta.url), 'utf8');

test('Worker integrates the guarded collection handler before legacy GET fallback', () => {
  const guard = worker.indexOf('await readPersonallyAuthorizedTeamCollection(req, env, {');
  const legacy = worker.indexOf('if (req.method !== "GET") return reply', guard);
  assert.ok(worker.includes("import { readPersonallyAuthorizedTeamCollection } from './production-team-collection-read.js';"));
  assert.ok(guard > 0, 'guard invocation is present');
  assert.ok(legacy > guard, 'guard precedes legacy reads');
  assert.match(worker, /NSK_REQUIRE_SCOPED_COLLECTION_READS === "true" \|\| req\.headers\.has\("Authorization"\)/);
  assert.ok(worker.includes('poolspel|matchkonfiguration|laguppstallningar|bytesschema'), 'collection route alternatives are present');
});

test('Worker reads trusted teams and collections through the same guarded adapter', () => {
  assert.match(worker, /listTrustedTeams: \(\) => readRows\("lag"\)/);
  assert.match(worker, /readRows,\s*listTrustedTeams/);
  assert.match(worker, /next\.origin !== "https:\/\/api\.baserow\.io"/);
});

test('Frontend keeps collection reads disabled unless explicitly opted in', () => {
  assert.match(frontend, /REQUIRE_SCOPED_COLLECTION_READS === true/);
  assert.match(frontend, /new Set\(\['poolspel','matchkonfiguration','laguppstallningar','bytesschema'\]\)/);
  assert.match(frontend, /collectionReadOptions\(table, team\)/);
  assert.match(frontend, /Authorization: 'Bearer ' \+ token/);
});

test('Frontend passes resolved team for each guarded collection', () => {
  for (const name of ['poolspel', 'matchkonfiguration', 'laguppstallningar', 'bytesschema']) {
    assert.match(frontend, new RegExp("rows\\('"+name+"',"));
  }
});
