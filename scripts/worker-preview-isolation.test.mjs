import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const preview=readFileSync(new URL('../wrangler.api.preview.toml',import.meta.url),'utf8');
const production=readFileSync(new URL('../wrangler.api.production.toml',import.meta.url),'utf8');
const sections=preview.split(/(?=^\[\[?[^\n]+\]?\]\s*$)/m);
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
  assert.doesNotMatch(preview,/^\s*(BASEROW_TOKEN|ADMIN_PASSWORD|MATCH_PASSWORD)\s*=/m);
  assert.match(preview,/NSK_PREVIEW_ISOLATED = "true"/);
  assert.match(preview,/NSK_REQUIRE_PERSONAL_POOL_WRITES = "true"/);
});
