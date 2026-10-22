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
