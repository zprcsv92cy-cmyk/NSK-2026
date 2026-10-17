import assert from 'node:assert/strict';
import {handlePersonalShiftDone} from './production-personal-shift-done.js';
import candidate from './production-entry-candidate.js';
const bearer='A'.repeat(43),origin='https://zprcsv92cy-cmyk.github.io';
const req=(id,team='18',auth=bearer)=>new Request('https://nsk-api.invalid/api/personal/bytesschema/'+id+'/done',{
  method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json',
    ...(auth?{Authorization:'Bearer '+auth}:{})},
  body:JSON.stringify({team_id:team,done:true})
});
let calls=0,writes=0;
const env={BASEROW_TOKEN:'test',
 SHIFT_SAVE_LOCK:{idFromName:key=>{assert.equal(key,'100:1:1');return key;},
 get:()=>({fetch:async (url,opts)=>{calls++;
   const body=JSON.parse(opts.body);
   assert.deepEqual(body,{action:'done',id:7,team_id:18,pool_id:100,lag_no:1,match_no:1,done:true});
   return Response.json({ok:true});}})},
 AUTH_DB:{prepare:sql=>({bind:()=>({
   first:async()=>({id:'u',display_name:'Editor'}),
   all:async()=>({results:sql.includes('auth_team_memberships')?
     [{team_id:'NSK Team 18',role:'team_admin'}]:[{permission:'shifts:check'}]})
 })})}};
const orig=globalThis.fetch;
globalThis.fetch=async resource=>{
  const s=String(resource);
  if(s.includes('/1255083/'))return Response.json({results:[
    {id:18,Namn:'NSK Team 18','Säsong':'2026'},
    {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],next:null});
  if(s.includes('/1255115/7/'))return Response.json({id:7,Poolspel:[100],Lagnummer:1,Matchnummer:1});
  if(s.includes('/1255115/8/'))return Response.json({id:8,Poolspel:[200],Lagnummer:1,Matchnummer:1});
  if(s.includes('/1255101/100/'))return Response.json({id:100,Lag:[18],'Antal lag':2,'Antal matcher':3});
  if(s.includes('/1255101/200/'))return Response.json({id:200,Lag:[27],'Antal lag':2,'Antal matcher':3});
  throw Error('Unexpected '+s);
};
try{
  let r=await handlePersonalShiftDone(req(7),env);
  assert.equal(r.status,200);assert.equal(calls,1);
  r=await handlePersonalShiftDone(req(8),env);
  assert.equal(r.status,403);assert.equal(calls,1);
  r=await handlePersonalShiftDone(req(7,'27'),env);
  assert.equal(r.status,403);assert.equal(calls,1);
  r=await handlePersonalShiftDone(req(7,'18',null),env);
  assert.equal(r.status,401);assert.equal(calls,1);
  r=await handlePersonalShiftDone(req(7),{AUTH_DB:env.AUTH_DB,BASEROW_TOKEN:'test'});
  assert.equal(r.status,503);assert.equal(calls,1);
  r=await candidate.fetch(req(7),env,{});
  assert.equal(r.status,200);assert.equal(calls,2);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
  console.log('PASS guarded shift completion rejects other teams and missing sessions');
}finally{globalThis.fetch=orig;}
