import assert from 'node:assert/strict';
import {handlePersonalStaffMutation as write} from './production-personal-staff-mutation.js';
import candidate from './production-entry-candidate.js';

const token='A'.repeat(43), base='https://nsk-api.invalid';
const payload={team_id:'18',role:'Lagledare',name:'Test'};
const request=(method,data,authorization=token)=>new Request(base+'/api/personal/lagpersonal',{
  method,headers:{Origin:'https://zprcsv92cy-cmyk.github.io',
    ...(authorization?{Authorization:'Bearer '+authorization}:{}),
    'Content-Type':'application/json'},body:JSON.stringify(data)});
const oldFetch=globalThis.fetch;
const staff=[];
const KV={get:async key=>{assert.equal(key,'lagpersonal:team:18');return structuredClone(staff);},
  put:async (key,val)=>{assert.equal(key,'lagpersonal:team:18');staff.splice(0,staff.length,...JSON.parse(val));}};
const env={BASEROW_TOKEN:'test',NSK_TRAINERS:KV,AUTH_DB:{prepare:sql=>({bind:()=>({
  first:async()=>({id:'u1',display_name:'Admin'}),
  all:async()=>({results:sql.includes('auth_team_memberships')?
    [{team_id:'NSK Team 18',role:'team_admin'}]:
    [{permission:'roster:manage'}]})
})})}};
globalThis.fetch=async url=>{
  if(String(url).includes('/1255083/'))return Response.json({results:[
    {id:18,Namn:'NSK Team 18','Säsong':'2026'},
    {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],next:null});
  throw Error('Unexpected fetch '+url);
};
try{
  let r=await write(request('POST',payload),env);
  assert.equal(r.status,201);
  const row=(await r.json()).row;
  assert.equal(staff.length,1);
  r=await write(request('PATCH',{...payload,id:row.id,name:'Changed'}),env);
  assert.equal(r.status,200);
  assert.equal(staff[0].name,'Changed');
  r=await write(request('PATCH',{...payload,team_id:'27',id:row.id}),env);
  assert.equal(r.status,403);
  r=await write(request('PATCH',{...payload,id:'00000000-0000-4000-8000-000000000000'}),env);
  assert.equal(r.status,404);
  r=await write(request('POST',{...payload,role:'INVALID'}),env);
  assert.equal(r.status,400);
  r=await write(request('POST',payload,null),env);
  assert.equal(r.status,401);
  r=await candidate.fetch(request('POST',{...payload,name:'Next'}),env,{});
  assert.equal(r.status,201);
  assert.equal(staff.length,2);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://zprcsv92cy-cmyk.github.io');
  console.log('PASS protected personal staff writes and foreign-team denial');
}finally{globalThis.fetch=oldFetch;}
