import assert from 'node:assert/strict';
import {handlePersonalRosterMutation as mutate} from './production-personal-roster-mutation.js';
import candidate from './production-entry-candidate.js';
const ROOT='https://nsk-api.invalid';
const TOKEN='A'.repeat(43);
const request=(path,method,body,token=TOKEN)=>
  new Request(ROOT+path,{method,headers:{
    ...(token?{Authorization:'Bearer '+token}:{}),
    'Content-Type':'application/json','Origin':'https://zprcsv92cy-cmyk.github.io'
  },body:JSON.stringify(body)});
const env={BASEROW_TOKEN:'test-only',AUTH_DB:{prepare(sql){
  return {bind(){if(sql.includes('auth_sessions'))return {first:async()=>({id:'u',display_name:'Admin'})};
    if(sql.includes('auth_team_memberships'))return {all:async()=>({results:[{team_id:'NSK Team 18',role:'team_admin'}]})};
    if(sql.includes('auth_user_permissions'))return {all:async()=>({results:[{permission:'roster:manage'}]})};
    throw Error('unexpected identity query');}};
}}};
let writes=0, bodyWritten=null;
const originalFetch=globalThis.fetch;
globalThis.fetch=async (resource, options={})=>{
  const url=String(resource);
  if(url.includes('/1255083/'))return Response.json({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'},
    {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],next:null});
  if(url.includes('/1255098/7/'))return Response.json({id:7,Namn:'Test',Lag:[{id:18}]});
  if(url.includes('/1255098/8/'))return Response.json({id:8,Namn:'Other',Lag:[{id:27}]});
  if(url.includes('/1255098/')&&['POST','PATCH','DELETE'].includes(options.method)){
    writes++;bodyWritten=options.body&&JSON.parse(options.body);
    return options.method==='DELETE'?new Response(null,{status:204}):
      Response.json({id:9,Namn:bodyWritten.Namn,Lag:[{id:18}]}, {status:options.method==='POST'?201:200});
  }
  throw Error('Unexpected fetch '+url);
};
try{
  let result=await mutate(request('/api/personal/spelare','POST',{team_id:'18',name:'New player'}),env);
  assert.equal(result.status,201);
  assert.deepEqual(bodyWritten,{Namn:'New player',Lag:[18]});
  assert.equal(writes,1);
  result=await mutate(request('/api/personal/spelare/7','PATCH',{team_id:'18',name:'Renamed'}),env);
  assert.equal(result.status,200);
  assert.deepEqual(bodyWritten,{Namn:'Renamed'});
  assert.equal(writes,2);
  result=await mutate(request('/api/personal/spelare/8','PATCH',{team_id:'18',name:'Stolen'}),env);
  assert.equal(result.status,403);assert.equal(writes,2);
  result=await mutate(request('/api/personal/spelare/7','DELETE',{team_id:'27'}),env);
  assert.equal(result.status,403);assert.equal(writes,2);
  result=await mutate(request('/api/personal/spelare','POST',{team_id:'18',name:'Hack',Lag:[27]}),env);
  assert.equal(result.status,400);assert.equal(writes,2);
  result=await mutate(request('/api/personal/spelare','POST',{team_id:'18',name:'Unauth'},null),env);
  assert.equal(result.status,401);assert.equal(writes,2);
  result=await mutate(request('/api/personal/spelare/7','DELETE',{team_id:'18'}),env);
  assert.equal(result.status,200);assert.equal(writes,3);
  result=await candidate.fetch(request('/api/personal/spelare','POST',{team_id:'18',name:'Entrypoint'}),env,{});
  assert.equal(result.status,201);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'),'https://zprcsv92cy-cmyk.github.io');
  console.log('PASS personal roster mutation: real write adapter, foreign rows denied');
}finally{globalThis.fetch=originalFetch;}
