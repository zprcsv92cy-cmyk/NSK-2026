import assert from 'node:assert/strict';

const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const expected=process.env.EXPECTED_ACTIVE_VERSION;
const expectedWriteFlags=process.env.EXPECTED_PERSONAL_WRITE_FLAGS;
assert.ok(['true','false'].includes(expectedWriteFlags),'Expected personal write flags must be explicitly true or false');
if(!token||!account)throw Error('Cloudflare API credentials required');
assert.match(expected||'',/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);

const root='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/scripts/nsk-api';
async function get(path){
  const response=await fetch(root+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,'Cloudflare read-only request failed at '+path+' (HTTP '+response.status+')');
  const data=await response.json();
  assert.equal(data.success,true,'Cloudflare request unsuccessful at '+path);
  return data.result;
}
const [deployment,settings]=await Promise.all([get('/deployments'),get('/settings')]);
const active=deployment.deployments?.[0]?.versions||[];
assert.deepEqual(active,[{version_id:expected,percentage:100}],'Production traffic changed; abort coordinated release');
// Script settings can reflect the last UPLOADED version, not the live deployed version.
const liveVersion=await get('/versions/'+expected);
const liveBindings=liveVersion.resources?.bindings||[];
const bindings=settings.bindings||[];
const expectations=[
  ['AUTH_DB','d1','9f937bcb-b0c0-4129-af5b-775cf284dfcb'],
  ['ADMIN_KV','kv_namespace','7f978e9bbcd04b888e5b0dfbc338ba5d'],
  ['NSK_TRAINERS','kv_namespace','f60b048621ea4aca8d67774f5c9db664'],
  ['SHIFT_LOCK','durable_object_namespace','27cd8685c58e4b8aa0aaa85a9d47f6ed']
];
for(const [name,type,id] of expectations){
  const item=bindings.find(x=>x.name===name);
  assert.equal(item?.type,type,'Production binding type mismatch for '+name);
  assert.equal(item.database_id||item.namespace_id,id,'Production binding ID mismatch for '+name);
}
for(const name of ['BASEROW_TOKEN','ADMIN_PASSWORD','MATCH_PASSWORD']){
  assert.equal(bindings.find(x=>x.name===name)?.type,'secret_text','Missing named secret: '+name);
}
for(const name of ['NSK_REQUIRE_SCOPED_ROSTER_READS','NSK_REQUIRE_SCOPED_TEAM_READS','NSK_REQUIRE_SCOPED_COLLECTION_READS']){
  assert.equal(bindings.find(x=>x.name===name)?.text,'true','Scoped read disabled: '+name);
}
for(const name of ['NSK_REQUIRE_PERSONAL_POOL_WRITES','NSK_REQUIRE_PERSONAL_MATCH_WRITES','NSK_REQUIRE_PERSONAL_COACH_SELECTION']){
  assert.equal(liveBindings.find(x=>x.name===name)?.text||'false',expectedWriteFlags,'Active deployed version personal write flag drift: '+name);
}
const candidate=await get('/versions/c4a7024e-6621-4e7d-8b88-7ef3cdecd670');
assert.equal(candidate.metadata?.has_preview,false);
const summary=[
'## NSK Production Cutover — read-only preflight',
'- Active production Worker: \`'+expected+'\` (100% traffic)',
'- Existing D1, KV and ShiftLock identifiers match the approved baseline',
'- Secret bindings are present by name; values have not been read',
'- Active deployed Worker personal write flags verified as '+expectedWriteFlags,
'- Script settings may show newer uploaded-version flags; those do not prove production traffic changed',
'- Older uploaded candidate still has no Preview endpoint',
'- **No deployment, rollback, or data mutation was performed**',
'- A Worker version rollback alone does not restore data written to D1, KV, Baserow or Durable Objects'
].join('\n');
console.log(summary);
if(process.env.GITHUB_STEP_SUMMARY){
 const fs=await import('node:fs');
 fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
}
