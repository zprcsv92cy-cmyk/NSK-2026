import assert from 'node:assert/strict';
import {handlePersonalRosterRead as handle} from './production-personal-roster-endpoint.js';
const token='T'.repeat(43);
const req=(path,auth=token,origin='https://zprcsv92cy-cmyk.github.io',method='GET')=>
  new Request('https://nsk-api.invalid'+path,{method,headers:{
    ...(auth?{Authorization:'Bearer '+auth}:{}), ...(origin?{Origin:origin}:{})
  }});
let baserowCalls=0;
const oldFetch=globalThis.fetch;
globalThis.fetch=async url=>{
  baserowCalls++;
  const text=String(url);
  if(text.includes('/1255083/'))return Response.json({results:[
    {id:18,Namn:'NSK Team 18','Säsong':'2026'},
    {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],next:null});
  if(text.includes('/1255098/'))return Response.json({results:[
    {id:7,Namn:'Team 18 player',Lag:[{id:18}]},
    {id:8,Namn:'Other player',Lag:[{id:27}]}],next:null});
  throw Error('Unexpected Baserow table: '+text);
};
const mockDb={
  prepare(sql){
    return {
      bind(){
        if(sql.includes('auth_sessions'))return {first:async()=>({id:'u1',display_name:'Test'})};
        if(sql.includes('auth_team_memberships'))return {all:async()=>({results:[{team_id:'NSK Team 18',role:'viewer'}]})};
        if(sql.includes('auth_user_permissions'))return {all:async()=>({results:['read'].map(permission=>({permission}))})};
        throw Error('Unknown identity query');
      }
    };
  }
};
const env={AUTH_DB:mockDb,BASEROW_TOKEN:'unused-test-token',NSK_TRAINERS:{
  get:async()=>[{id:'s1',name:'Staff Member',role:'Lagledare'}]
}};
try {
  let r=await handle(req('/api/personal/spelare?team_id=18'),env);
  assert.equal(r.status,200);
  assert.deepEqual((await r.json()).results.map(x=>x.id),[7]);
  assert.equal(r.headers.get('access-control-allow-origin'),'https://zprcsv92cy-cmyk.github.io');

  const previous=baserowCalls;
  r=await handle(req('/api/personal/spelare?team_id=27'),env);
  assert.equal(r.status,403);
  assert.equal(baserowCalls,previous+2,'foreign team may be looked up but never load player rows');

  r=await handle(req('/api/personal/lagpersonal?team_id=18'),env);
  assert.equal(r.status,200);
  assert.equal((await r.json()).results[0].id,'s1');

  r=await handle(req('/api/personal/spelare?team_id=18',null),env);
  assert.equal(r.status,401);
  r=await handle(req('/api/personal/spelare?team_id=18',token,'https://evil.invalid'),env);
  assert.equal(r.status,403);
  r=await handle(req('/api/personal/spelare?team_id=18',token,null),{BASEROW_TOKEN:'missing-db'});
  assert.equal(r.status,503);
  r=await handle(req('/api/personal/spelare?team_id=18&team_id=27'),env);
  assert.equal(r.status,400);
  r=await handle(req('/api/personal/spelare?team_id=18',token,null,'POST'),env);
  assert.equal(r.status,405);
  console.log('PASS standalone personal roster endpoint; no production changes');
} finally { globalThis.fetch=oldFetch; }
