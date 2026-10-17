import assert from 'node:assert/strict';
import {handlePersonalPoolList} from './production-personal-pools.js';
import candidate from './production-entry-candidate.js';
const base='https://nsk-api.invalid';
const bearer='A'.repeat(43);
const req=(path,token=bearer)=>new Request(base+path,{
  headers:{Origin:'https://zprcsv92cy-cmyk.github.io',...(token?{Authorization:'Bearer '+token}:{})}
});
const env={BASEROW_TOKEN:'mock',AUTH_DB:{prepare:sql=>({bind:()=>({
  first:async()=>({id:'u1',display_name:'Tester'}),
  all:async()=>({results:sql.includes('auth_team_memberships')?
    [{team_id:'NSK Team 18',role:'viewer'}]:[{permission:'read'}]})
})})}};
let poolCalls=0;
const original=globalThis.fetch;
globalThis.fetch=async url=>{
  if(String(url).includes('/1255083/'))return Response.json({results:[
    {id:18,Namn:'NSK Team 18','Säsong':'2026'},
    {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],next:null});
  if(String(url).includes('/1255101/')){
    poolCalls++;
    return Response.json({results:[
      {id:100,Namn:'Home',Lag:[{id:18}]},
      {id:101,Namn:'Away',Lag:[{id:27}]},
      {id:102,Namn:'Shared',Lag:[18,27]},
      {id:103,Namn:'No Team',Lag:[]}
    ],next:null});
  }
  throw Error('Unexpected Baserow endpoint '+url);
};
try{
  let response=await handlePersonalPoolList(req('/api/personal/poolspel?team_id=18&size=1'),env);
  assert.equal(response.status,200);
  assert.deepEqual((await response.json()).results.map(r=>r.id),[100]);
  response=await handlePersonalPoolList(req('/api/personal/poolspel?team_id=18&page=2&size=1'),env);
  assert.deepEqual((await response.json()).results.map(r=>r.id),[102]);
  const prior=poolCalls;
  response=await handlePersonalPoolList(req('/api/personal/poolspel?team_id=27'),env);
  assert.equal(response.status,403);
  assert.equal(poolCalls,prior,'Foreign team request must not query pool table');
  response=await handlePersonalPoolList(req('/api/personal/poolspel?team_id=18',null),env);
  assert.equal(response.status,401);
  response=await handlePersonalPoolList(req('/api/personal/poolspel?team_id=18'),{BASEROW_TOKEN:'mock'});
  assert.equal(response.status,503);
  for(const path of ['/api/personal/poolspel?team_id=18&team_id=27',
    '/api/personal/poolspel?team_id=18&page=-2',
    '/api/personal/poolspel?team_id=18&size=250']){
    response=await handlePersonalPoolList(req(path),env);
    assert.equal(response.status,400,path);
  }
  response=await candidate.fetch(req('/api/personal/poolspel?team_id=18'),env,{});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://zprcsv92cy-cmyk.github.io');
  assert.deepEqual((await response.json()).results.map(r=>r.id),[100,102]);
  console.log('PASS personal pool reads scoped to verified team');
}finally{globalThis.fetch=original;}
