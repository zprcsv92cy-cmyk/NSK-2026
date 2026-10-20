import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const expected='7434d756-524c-43c4-95b2-73cc942a256b';
const runner=`
const expected='${expected}';
const bindings=[
 {name:'AUTH_DB',type:'d1',database_id:'9f937bcb-b0c0-4129-af5b-775cf284dfcb'},
 {name:'ADMIN_KV',type:'kv_namespace',namespace_id:'7f978e9bbcd04b888e5b0dfbc338ba5d'},
 {name:'NSK_TRAINERS',type:'kv_namespace',namespace_id:'f60b048621ea4aca8d67774f5c9db664'},
 {name:'SHIFT_LOCK',type:'durable_object_namespace',namespace_id:'27cd8685c58e4b8aa0aaa85a9d47f6ed'},
 ...['BASEROW_TOKEN','ADMIN_PASSWORD','MATCH_PASSWORD'].map(name=>({name,type:'secret_text'})),
 ...['NSK_REQUIRE_SCOPED_ROSTER_READS','NSK_REQUIRE_SCOPED_TEAM_READS','NSK_REQUIRE_SCOPED_COLLECTION_READS'].map(name=>({name,type:'plain_text',text:'true'}))
];
if(process.env.FIXTURE==='wrong-write-type') bindings.push({name:'NSK_REQUIRE_PERSONAL_POOL_WRITES',type:'secret_text'});
if(process.env.FIXTURE==='wrong-database') bindings[0].database_id='unexpected';
if(process.env.FIXTURE==='write-enabled') bindings.push({name:'NSK_REQUIRE_PERSONAL_POOL_WRITES',type:'plain_text',text:'true'});
if(process.env.FIXTURE==='scoped-read-disabled') bindings.find(x=>x.name==='NSK_REQUIRE_SCOPED_TEAM_READS').text='false';
globalThis.fetch=async url=>{
 const path=new URL(url).pathname;
 let result;
 if(path.endsWith('/deployments')) result={deployments:[{versions:[{version_id:expected,percentage:100}]}]};
 else if(path.endsWith('/versions/'+expected)) result={resources:{bindings}};
 else if(path.endsWith('/versions/c4a7024e-6621-4e7d-8b88-7ef3cdecd670')) result={metadata:{has_preview:false}};
 else throw Error('Unexpected read: '+path);
 return {status:200,json:async()=>({success:true,result})};
};
await import(process.env.PREFLIGHT_URL);
`;
function run(fixture){
 return spawnSync(process.execPath,['--input-type=module','-e',runner],{
  encoding:'utf8',
  env:{...process.env,FIXTURE:fixture,PREFLIGHT_URL:new URL('./production-cutover-readonly-preflight.mjs',import.meta.url).href,
   CLOUDFLARE_API_TOKEN:'fixture-only',CLOUDFLARE_ACCOUNT_ID:'fixture-account',
   EXPECTED_ACTIVE_VERSION:expected,EXPECTED_PERSONAL_WRITE_FLAGS:'false'}
 });
}
test('read-only preflight accepts known production baseline with absent write flags',()=>{
 const r=run('baseline');
 assert.equal(r.status,0,r.stderr);
 assert.match(r.stdout,/personal write flags verified as false/);
});
test('read-only preflight rejects unexpected personal write binding type',()=>{
 const r=run('wrong-write-type');
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Unexpected active personal write flag binding type/);
});
test('read-only preflight rejects drifted D1 binding',()=>{
 const r=run('wrong-database');
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Active production binding ID mismatch for AUTH_DB/);
});

test('read-only preflight rejects unexpectedly enabled personal writes',()=>{
 const r=run('write-enabled');
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Active deployed version personal write flag drift/);
});
test('read-only preflight rejects disabled scoped team reads',()=>{
 const r=run('scoped-read-disabled');
 assert.notEqual(r.status,0);
 assert.match(r.stderr,/Active deployed version scoped read flag drift/);
});
