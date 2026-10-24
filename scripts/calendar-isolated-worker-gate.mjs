import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// This is a static, read-only gate for the dedicated isolated Worker.
// Runtime Baserow token scope and authorized writes require separate verification.
export function verifyDedicatedIsolatedWorker(manifest,production) {
  const read=(source,name)=>new RegExp('^'+name+'\\s*=\\s*"([^"\\n]*)"','m').exec(source)?.[1];
  assert.equal(read(manifest,'name'),'nsk-api-isolated-preview','Only the dedicated isolated Worker may be targeted');
  assert.equal(read(manifest,'main'),'worker/production-api-v42-reference.js');
  assert.equal(read(manifest,'NSK_ISOLATED_MODE'),'true');
  assert.equal(read(manifest,'NSK_PREVIEW_ISOLATED'),'true');
  assert.equal(read(manifest,'NSK_REQUIRE_PERSONAL_POOL_WRITES'),'true');
  assert.equal(read(manifest,'NSK_REQUIRE_PERSONAL_MATCH_WRITES'),'true');
  assert.equal(read(manifest,'BASEROW_DATABASE_ID'),'599495');
  const productionId=read(production,'BASEROW_DATABASE_ID');
  assert.ok(productionId && productionId!==read(manifest,'BASEROW_DATABASE_ID'));
  const tableSource=read(manifest,'BASEROW_TABLE_IDS');
  assert.ok(tableSource,'Isolated Baserow table mapping missing');
  const mapping=JSON.parse(JSON.parse('"'+tableSource+'"'));
  const required=['lag','spelare','tranare','poolspel','matcher','laguppstallningar','bytesschema','malvaktsstatistik','spelaretranare','matchkonfiguration'];
  assert.deepEqual(Object.keys(mapping).sort(),[...required].sort());
  assert.equal(new Set(Object.values(mapping)).size,10);
  const productionTables=new Set([1255083,1255098,1255100,1255101,1255109,1255113,1255115,1255119,1255152,1255157]);
  for(const id of Object.values(mapping)) assert.ok(Number.isSafeInteger(id)&&id>0&&!productionTables.has(id),'Production or invalid Baserow table reference');
  const prodD1=read(production,'database_id');
  const isolatedD1=read(manifest,'database_id');
  assert.ok(isolatedD1&&prodD1&&isolatedD1!==prodD1);
  assert.equal(isolatedD1,'b94c8dba-34be-4cff-a4e9-892caf4e3ddd');
  const isolatedKv=[...manifest.matchAll(/^id\s*=\s*"([^"]+)"$/gm)].map(m=>m[1]);
  const productionKv=new Set([...production.matchAll(/^id\s*=\s*"([^"]+)"$/gm)].map(m=>m[1]));
  assert.deepEqual(isolatedKv.sort(),['8b079c75ed6c4d4695476f1de24089fd','e8772468a0004f0ea78b02a5251eadf7'].sort());
  for(const id of isolatedKv)assert.ok(!productionKv.has(id),'Production KV is forbidden');
  assert.match(manifest,/^name = "SHIFT_LOCK"$/m);
  assert.doesNotMatch(manifest,/^\s*(BASEROW_TOKEN|ADMIN_PASSWORD|MATCH_PASSWORD)\s*=/m);
  assert.doesNotMatch(manifest,/^\[triggers\]/m,'Isolated Worker must not inherit scheduled production sync');
  return {target:'nsk-api-isolated-preview',database:read(manifest,'BASEROW_DATABASE_ID'),tables:required.length};
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const manifest=readFileSync(new URL('../wrangler.api.isolated-worker.toml',import.meta.url),'utf8');
  const production=readFileSync(new URL('../wrangler.api.production.toml',import.meta.url),'utf8');
  console.log('Static isolated Worker gate:',verifyDedicatedIsolatedWorker(manifest,production));
}
