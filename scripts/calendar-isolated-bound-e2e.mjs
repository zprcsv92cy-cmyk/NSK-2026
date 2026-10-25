import {planCalendarMatches} from '../calendar-match-plan.mjs';
export async function runIsolatedCalendarE2E(env, requestedCount) {
if(env.ISOLATED_APP!=='true'||!env.AUTH_DB||!env.ISOLATED_API)throw Error('Isolated bindings required');
if(![1,4,5,6,16].includes(requestedCount))throw Error("Invalid isolated test case");
const logs=[];const log=(...values)=>logs.push(values.join(' '));
const assert={equal(a,b,message='Unexpected result'){if(a!==b)throw Error(message+' ('+a+' !== '+b+')')},ok(value,message='Expected true'){if(!value)throw Error(message)}};
const sha256=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const query=async(sql,params=[])=>{const result=await env.AUTH_DB.prepare(sql).bind(...params).all();if(!result.success)throw Error('Isolated D1 operation failed');return result.results||[]};
const request=async(path,{method='GET',body,token}={})=>{const headers={Accept:'application/json'};if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';const r=await env.ISOLATED_API.fetch(new Request('https://nsk-api-isolated-preview.peter-hasselberg.workers.dev'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}));return{status:r.status,data:await r.json().catch(()=>({}))}};
try {
const runId=crypto.randomUUID();
const userId='nsk-calendar-e2e-'+runId;
const bearer=Array.from(crypto.getRandomValues(new Uint8Array(48)),b=>b.toString(16).padStart(2,'0')).join('');
const digest=await sha256(bearer);
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
  log('Synthetic test account authenticated; isolated team verified.');

  const unique='ISOLATED_E2E_'+runId.slice(0,8);
  const retained=[];
  for (const count of [requestedCount]) {
    const plan=planCalendarMatches(Array.from({length:count},(_,i)=>({
      startTime:String(9+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'),
      opponent:'Syntetisk motståndare '+(i+1),plan:'Testplan'
    })));
    const payload={title:'Poolspel',place:unique+'_'+count,hall:'Testhall',pool_date:'2026-11-15',
      status:'Aktiv',teams:plan.teams,matches:plan.matchesPerTeam,players_on_field:3,
      periods:1,period_time:15,sub_time:90,calendar_import_key:crypto.randomUUID()};
    const created=await request('/api/poolspel',{method:'POST',body:payload,token:bearer});
    assert.equal(created.status,201,'Pool '+count+' creation failed; inspect isolated Baserow before rerun: '+JSON.stringify(created.data));
    const poolId=Number(created.data.row?.id);
    assert.ok(Number.isSafeInteger(poolId)&&poolId>0);
    retained.push({poolId,matchIds:[],count});
    const repeat=await request('/api/poolspel',{method:'POST',body:payload,token:bearer});
    assert.equal(repeat.status,200);
    assert.equal(Number(repeat.data.row?.id),poolId);
    assert.equal(repeat.data.reused,true);
    const mismatch=await request('/api/poolspel',{method:'POST',body:{...payload,hall:'Changed'},token:bearer});
    assert.equal(mismatch.status,409);
    const first={pool_id:poolId,...plan.schedule[0],schedule_only:true};
    const initial=await request('/api/matchkonfiguration',{method:'POST',body:first,token:bearer});
    assert.equal(initial.status,201,JSON.stringify(initial.data));
    retained.at(-1).matchIds.push(initial.data.row.id);
    const duplicate=await request('/api/matchkonfiguration',{method:'POST',body:first,token:bearer});
    assert.equal(duplicate.status,409);
    const changed=await request('/api/matchkonfiguration/'+initial.data.row.id,{method:'PATCH',
      body:{...first,opponent:'Must not overwrite'},token:bearer});
    assert.equal(changed.status,409);
    const scoped='/api/matchkonfiguration?team_id='+teamId;
    const partial=await request(scoped,{token:bearer});
    assert.equal(partial.status,200);
    const existing=(partial.data.results||[]).filter(row=>row.Poolspel?.some(x=>Number(x.id)===poolId));
    assert.equal(existing.length,1,'First completed step must survive partial import');
    let skipped=0;
    for(const match of plan.schedule){
      if(existing.some(row=>Number(row.Lagnummer)===match.lag_no&&Number(row.Matchnummer)===match.match_no)){
        skipped++;continue;
      }
      const result=await request('/api/matchkonfiguration',{method:'POST',body:{pool_id:poolId,...match,schedule_only:true},token:bearer});
      assert.equal(result.status,201,JSON.stringify(result.data));
      retained.at(-1).matchIds.push(result.data.row.id);
    }
    assert.equal(skipped,1);
    const collection=await request(scoped,{token:bearer});
    assert.equal(collection.status,200);
    const saved=(collection.data.results||[]).filter(row=>row.Poolspel?.some(x=>Number(x.id)===poolId));
    assert.equal(saved.length,count);
    for(const match of plan.schedule){
      const rows=saved.filter(row=>Number(row.Lagnummer)===match.lag_no&&Number(row.Matchnummer)===match.match_no);
      assert.equal(rows.length,1);
      assert.equal(rows[0]['Motståndare'],match.opponent);
      assert.equal(String(rows[0].Starttid).slice(0,5),match.start_time);
      assert.equal(rows[0].Plan,match.plan);
      assert.ok(!rows[0]['Målvakt']?.length);
      assert.ok(!rows[0]['Spelare på plan']?.length);
    }
    log('PASS:',count,'matches;',plan.teams,'teams; retry/conflict/resume/scoped read; empty lineup. Pool ID:',poolId);
  }
  const anonymous=await request('/api/poolspel',{method:'POST',body:{}});
  assert.equal(anonymous.status,401);
  await query('DELETE FROM auth_user_permissions WHERE user_id=? AND permission=?',[userId,'pool:create']);
  const deniedPermission=await request('/api/poolspel',{method:'POST',body:{},token:bearer});
  assert.equal(deniedPermission.status,403);
  await query('DELETE FROM auth_team_memberships WHERE user_id=?',[userId]);
  const deniedTeam=await request('/api/matchkonfiguration',{method:'POST',body:{pool_id:retained[0].poolId,lag_no:1,match_no:1,schedule_only:true},token:bearer});
  assert.equal(deniedTeam.status,403);
  log('PASS: anonymous, missing permission and missing membership denied.');
  log('Synthetic isolated records retained for auditing:',JSON.stringify(retained));

} finally {
  if(inserted){
    try {
      await query('DELETE FROM auth_users WHERE id=?',[userId]);
      const remaining=await query('SELECT COUNT(*) AS n FROM auth_users WHERE id=?',[userId]);
      assert.equal(Number(remaining[0]?.n),0);
      log('Ephemeral synthetic login and account deleted from isolated D1.');
    } catch {
      log('WARNING: isolated synthetic account cleanup failed. Revoke/delete fixture by scoped ID.');
      throw Error("Synthetic account cleanup failed");
    }
  }
}

return {ok:true,logs};
}catch(error){return {ok:false,error:error.message,logs};}
}
