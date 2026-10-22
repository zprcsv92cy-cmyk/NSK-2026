import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=readFileSync(new URL('../wrangler.api.preview.toml',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/start-isolated-api-preview.yml',import.meta.url),'utf8');

test('preview remains explicitly blocked until prerequisites are met',()=>{
 assert.match(workflow,/inputs\.confirmation == 'PREVIEW_ONLY' && false/);
});

test('preview training feature flag is not enabled by default',()=>{
 assert.doesNotMatch(manifest,/^NSK_ENABLE_SHARED_TRAINING\s*=\s*"true"/m);
});

test('preview D1 binding is the isolated integration database, not the prepared preview-auth fixture',()=>{
 assert.match(manifest,/database_id = "b94c8dba-34be-4cff-a4e9-892caf4e3ddd"/);
 assert.doesNotMatch(manifest,/database_id = "c00ba406-8210-49ba-a0e2-03b838e7934e"/);
});


test('preview Baserow mapping points only to the isolated test database and tables',()=>{
 assert.match(manifest,/^BASEROW_DATABASE_ID\s*=\s*"599495"\s*$/m);
 assert.match(manifest,/^BASEROW_TABLE_IDS\s*=/m);
 assert.doesNotMatch(manifest,/^BASEROW_DATABASE_ID\s*=\s*"589073"\s*$/m);
 for (const productionTableId of [1255083,1255098,1255100,1255101,1255109,1255113,1255115,1255119,1255152,1255157]) {
  assert.doesNotMatch(manifest,new RegExp(':'+productionTableId+'(?=[,}])'));
 }
});

test('preview launch workflow enforces the Baserow readiness gate before Cloudflare access',()=>{
 const gate=workflow.indexOf('node scripts/isolated-preview-baserow-gate.mjs');
 const cloudflare=workflow.indexOf('Require Cloudflare Actions credentials');
 assert.ok(gate>=0&&cloudflare>gate);
});
