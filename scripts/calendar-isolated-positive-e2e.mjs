import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';

// Manual isolated test only. A synthetic D1 identity/session is created for
// this run and removed in finally. No password or bearer token is printed.
assert.equal(process.env.NSK_E2E_CONFIRMATION,'ISOLATED_CALENDAR_E2E');
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const cloudflareToken=process.env.CLOUDFLARE_API_TOKEN;
assert.equal(account,'262a0356b18defd22b05df6949c409bf');
assert.ok(cloudflareToken,'Cloudflare secret must be configured in isolated-preview');
const base='https://nsk-api-isolated-preview.peter-hasselberg.workers.dev';
const dbId='b94c8dba-34be-4cff-a4e9-892caf4e3ddd';
const api='https://api.cloudflare.com/client/v4/accounts/'+account;
const expectedVersion='e326ca7f-4f46-45e5-b994-abbb1a2ad9bd';
async function cfGet(path){
  const response=await fetch(api+path,{headers:{Authorization:'Bearer '+cloudflareToken},signal:AbortSignal.timeout(15000)});
  const data=await response.json();
  assert.ok(response.ok&&data.success,'Cloudflare isolated preflight failed');
  return data.result;
}
async function query(sql,params=[]){
  const response=await fetch(api+'/d1/database/'+dbId+'/query',{
    method:'POST',headers:{Authorization:'Bearer '+cloudflareToken,'Content-Type':'application/json'},
    body:JSON.stringify({sql,params}),signal:AbortSignal.timeout(15000)
  });
  const data=await response.json();
  assert.ok(response.ok&&data.success&&data.result?.[0]?.success,'Isolated D1 operation failed: '+response.status);
  return data.result[0].results||[];
}
async function request(path,{method='GET',body,token}={}){
  const headers={Accept:'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(body)headers['Content-Type']='application/json';
  const response=await fetch(base+path,{
    method,headers,...(body?{body:JSON.stringify(body)}:{}),
    redirect:'manual',signal:AbortSignal.timeout(25000)
  });
  let data;
  try{data=await response.json()}catch{data={}};
  return {status:response.status,data};
}
const deployments=await cfGet('/workers/scripts/nsk-api-isolated-preview/deployments');
const active=deployments.deployments?.[0]?.versions?.[0]?.version_id;
assert.equal(active,expectedVersion,'Deployed isolated Worker changed; re-review its code and pin before live writes.');
const settings=await cfGet('/workers/scripts/nsk-api-isolated-preview/settings');
const bindings=settings.bindings||[];
const binding=name=>bindings.find(b=>b.name===name);
assert.equal(binding('NSK_ISOLATED_MODE')?.text,'true');
assert.equal(binding('BASEROW_DATABASE_ID')?.text,'599495');
assert.equal(binding('NSK_REQUIRE_PERSONAL_POOL_WRITES')?.text,'true');
assert.equal(binding('NSK_REQUIRE_PERSONAL_MATCH_WRITES')?.text,'true');
assert.equal(binding('AUTH_DB')?.id,dbId);
assert.equal(binding('SHIFT_LOCK')?.type,'durable_object_namespace');
const map=JSON.parse(binding('BASEROW_TABLE_IDS')?.text||'{}');
assert.equal(map.poolspel,1273721);
assert.equal(map.matchkonfiguration,1273730);
assert.equal(map.lag,1273707);
assert.notEqual(map.poolspel,1255101);
console.log('Isolated-only deployment and Baserow bindings verified.');
const runId=randomUUID();
const userId='nsk-calendar-e2e-'+runId;
const bearer=randomBytes(48).toString('base64url');
const digest=createHash('sha256').update(bearer).digest('hex');
const email='nsk-calendar-'+runId+'@example.invalid';
let inserted=false;
try {
  // An ephemeral synthetic identity has no usable password. Its personal
  // session token exists only in this GitHub job's memory.
  await query('INSERT INTO auth_users (id,email,display_name,password_hash,disabled) VALUES (?,?,?,?,0)',
    [userId,email,'Isolated Calendar E2E','NO_PASSWORD_LOGIN']);
  inserted=true;
  await query('INSERT INTO auth_team_memberships (user_id,team_id,role) VALUES (?,?,?)',
    [userId,'NSK Team 18','team_admin']);
  for(const permission of ['read','pool:create','match:manage'])
    await query('INSERT INTO auth_user_permissions (user_id,permission) VALUES (?,?)',[userId,permission]);
  await query("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+15 minutes'))",
    [digest,userId]);

  const teams=await request('/api/lag',{token:bearer});
  assert.equal(teams.status,200,'Authorized team read failed');
  const team=(teams.data.results||[]).find(row=>row.Namn==='NSK Team 18'&&String(row['Säsong'])==='2026');
  assert.ok(team&&Number.isSafeInteger(Number(team.id)),'Synthetic team missing in isolated Baserow');
  const teamId=Number(team.id);
  console.log('Synthetic test account authenticated; isolated team verified.');

  const unique='ISOLATED_E2E_'+runId.slice(0,8);
  const payload={
    title:'Poolspel',place:unique,hall:'Testhall',pool_date:'2026-11-15',
    status:'Aktiv',teams:1,matches:1,players_on_field:3,
    periods:1,period_time:15,sub_time:90,calendar_import_key:randomUUID()
  };
  const created=await request('/api/poolspel',{method:'POST',body:payload,token:bearer});
  // Never blindly retry if a write may have succeeded; the import key
  // protects retries, but failed statuses require manual reconciliation.
  assert.equal(created.status,201,'Pool creation did not return 201; inspect isolated Baserow before re-running');
  const poolId=Number(created.data.row?.id);
  assert.ok(Number.isSafeInteger(poolId)&&poolId>0);
  console.log('Synthetic pool created in isolated Baserow; pool ID:',poolId);
  const repeat=await request('/api/poolspel',{method:'POST',body:payload,token:bearer});
  assert.equal(repeat.status,200,'Idempotent retry must return 200');
  assert.equal(Number(repeat.data.row?.id),poolId);
  assert.equal(repeat.data.reused,true);
  const mismatch=await request('/api/poolspel',{method:'POST',body:{...payload,hall:'Changed'},
    token:bearer});
  assert.equal(mismatch.status,409,'Conflicting retry must return 409');

  const match={pool_id:poolId,lag_no:1,match_no:1,start_time:'10:15',
    opponent:'Syntetisk motståndare',plan:'Testplan',schedule_only:true};
  const matchCreated=await request('/api/matchkonfiguration',{method:'POST',body:match,token:bearer});
  assert.equal(matchCreated.status,201,'Schedule-only match was not created');
  const matchId=Number(matchCreated.data.row?.id);
  assert.ok(Number.isSafeInteger(matchId)&&matchId>0);
  const duplicate=await request('/api/matchkonfiguration',{method:'POST',body:match,token:bearer});
  assert.equal(duplicate.status,409,'Duplicate schedule-only match must fail');
  const collection=await request('/api/matchkonfiguration?team_id='+teamId,{token:bearer});
  assert.equal(collection.status,200,'Authorized scoped match read failed');
  const rows=collection.data.results||[];
  const saved=rows.filter(row=>Number(row.id)===matchId);
  assert.equal(saved.length,1,'Exactly one isolated match expected');
  assert.equal(saved[0]['Motståndare'],'Syntetisk motståndare');
  assert.equal(saved[0].Starttid,'10:15');
  assert.ok(!saved[0]['Målvakt']?.length);
  assert.ok(!saved[0]['Spelare på plan']?.length);
  console.log('PASS: create/retry/conflict, match metadata, no goalie/players, scoped read, no duplicate.');
  console.log('Isolated synthetic pool and match retained for auditing:',poolId,matchId);
} finally {
  if(inserted){
    try {
      await query('DELETE FROM auth_users WHERE id=?',[userId]);
      const remaining=await query('SELECT COUNT(*) AS n FROM auth_users WHERE id=?',[userId]);
      assert.equal(Number(remaining[0]?.n),0);
      console.log('Ephemeral synthetic login and account deleted from isolated D1.');
    } catch {
      console.error('WARNING: isolated synthetic account cleanup failed. Revoke/delete fixture by scoped ID.');
      process.exitCode=1;
    }
  }
}
