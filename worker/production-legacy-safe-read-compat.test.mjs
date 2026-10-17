import assert from 'node:assert/strict';
import candidate from './production-entry-candidate.js';
const base='https://nsk.invalid';
const bearer='A'.repeat(43);
const env={BASEROW_TOKEN:'mock',
 AUTH_DB:{prepare(sql){return {bind(){return {
  first:async()=>({id:'coach1',display_name:'Coach'}),
  all:async()=>({results:sql.includes('auth_team_memberships')
   ?[{team_id:'NSK Team 18',role:'team_admin'}]
   :[{permission:'read'}]})
 };}}}},
 NSK_TRAINERS:{get:async key=>{
  assert.equal(key,'lagpersonal:team:18');
  return [{id:'staff1',name:'Staff',role:'Lagledare'}];
 }}
};
const teams=[{id:18,Namn:'NSK Team 18','Säsong':'2026'},
 {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}];
const oldFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 assert.match(String(url),/api\.baserow\.io/);
 return Response.json({results:teams,next:null});
};
const req=(path,auth=true,origin='https://zprcsv92cy-cmyk.github.io')=>
 new Request(base+path,{headers:{Origin:origin,...(auth?{Authorization:'Bearer '+bearer}:{})}});
try {
 let r=await candidate.fetch(req('/api/lag'),env,{});
 assert.equal(r.status,200);
 const list=await r.json();
 assert.deepEqual(list.results.map(x=>x.Namn),['NSK Team 18']);
 assert.equal(r.headers.get('access-control-allow-origin'),'https://zprcsv92cy-cmyk.github.io');
 r=await candidate.fetch(req('/api/lagpersonal?team_id=18'),env,{});
 assert.equal(r.status,200);
 assert.deepEqual((await r.json()).results,[{id:'staff1',name:'Staff',role:'Lagledare'}]);
 r=await candidate.fetch(req('/api/lagpersonal?team_id=27'),env,{});
 assert.equal(r.status,403,'Staff from another team must not be exposed');
 for(const path of ['/api/lag','/api/lagpersonal?team_id=18']){
   r=await candidate.fetch(req(path,false),env,{});
   assert.equal(r.status,401);
   r=await candidate.fetch(req(path,true,'https://hostile.invalid'),env,{});
   assert.equal(r.status,403);
   r=await candidate.fetch(req(path,true),{BASEROW_TOKEN:'mock'},{});
   assert.equal(r.status,503);
   r=await candidate.fetch(new Request(base+path,{method:'POST'}),env,{});
   assert.equal(r.status,503);
 }
 console.log('PASS team and staff legacy GET aliases enforce per-person scope; writes remain blocked');
}finally{globalThis.fetch=oldFetch;}
