import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const preview=readFileSync(new URL('../wrangler.api.preview.toml',import.meta.url),'utf8');
const production=readFileSync(new URL('../wrangler.api.production.toml',import.meta.url),'utf8');

test('preview D1, KV, vars and ShiftLock bindings stay under previews only',()=>{
  assert.match(preview,/\[previews\.vars\]/);
  assert.match(preview,/\[\[previews\.d1_databases\]\]/);
  assert.equal((preview.match(/\[\[previews\.kv_namespaces\]\]/g)||[]).length,2);
  assert.match(preview,/\[\[previews\.durable_objects\.bindings\]\]/);
  assert.doesNotMatch(preview,/^\[vars\]|^\[\[d1_databases\]\]|^\[\[kv_namespaces\]\]|^\[\[durable_objects\.bindings\]\]/m);
});

test('preview never inherits production data stores or hardcoded secrets',()=>{
  for(const id of ['9f937bcb-b0c0-4129-af5b-775cf284dfcb','7f978e9bbcd04b888e5b0dfbc338ba5d','f60b048621ea4aca8d67774f5c9db664']){
    assert.ok(production.includes(id));
    assert.ok(!preview.includes(id),'Production resource ID included in Preview');
  }
  assert.doesNotMatch(preview,/BASEROW_DATABASE_ID\s*=\s*"589073"/);
  // An isolated mapping is required before preview can run; reject only production
  // table IDs and secrets, not all Baserow configuration unconditionally.
  assert.doesNotMatch(preview,/^\\s*BASEROW_TOKEN\\s*=/m);
  for (const productionTableId of ['1255083','1255098','1255100','1255101','1255109','1255113','1255115','1255119','1255152','1255157']) {
    assert.doesNotMatch(preview, new RegExp('\\\\b' + productionTableId + '\\\\b'),
      'Production Baserow table ID included in preview');
  }
  assert.match(preview,/database_id = "b94c8dba-34be-4cff-a4e9-892caf4e3ddd"/);
  assert.match(preview,/id = "8b079c75ed6c4d4695476f1de24089fd"/);
  assert.match(preview,/id = "e8772468a0004f0ea78b02a5251eadf7"/);
  assert.doesNotMatch(preview,/^\s*(BASEROW_TOKEN|ADMIN_PASSWORD|MATCH_PASSWORD)\s*=/m);
  assert.match(preview,/NSK_PREVIEW_ISOLATED = "true"/);
  assert.match(preview,/NSK_ISOLATED_MODE = "true"/);
  assert.match(preview,/NSK_REQUIRE_PERSONAL_POOL_WRITES = "true"/);
});
