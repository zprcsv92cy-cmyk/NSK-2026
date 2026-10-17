import assert from 'node:assert/strict';
import { handleProductionAuth } from './production-auth-boundary.js';
const origin='https://zprcsv92cy-cmyk.github.io',token='A'.repeat(43);
const env={
 BASEROW_TOKEN:'fake',
 AUTH_DB:{prepare(sql){return {bind(){return {
   first:async()=>({id:'root',display_name:'Global owner'}),
   all:async()=>({results:sql.includes('auth_team_memberships')
     ?[{team_id:'*',role:'owner'}]
     :[{permission:'read'},{permission:'roster:manage'}]})
 };}}}}
};
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>Response.json({results:[
 {id:18,Namn:'NSK Team 18','Säsong':'2026'},
 {id:27,Namn:'NSK Testlag 2','Säsong':'2026'},
 {id:55,Namn:'NSK Team 19','Säsong':'2025'}
],next:null});
const get=path=>new Request('https://api.example.invalid'+path,{
 headers:{Origin:origin,Authorization:'Bearer '+token}
});
try{
 let r=await handleProductionAuth(get('/api/auth/me'),env);
 assert.equal(r.status,200);
 let json=await r.json();
 assert.deepEqual(json.memberships.map(m=>m.team_id),['NSK Team 18','NSK Testlag 2']);
 for(const name of ['NSK Team 18','NSK Testlag 2']){
   r=await handleProductionAuth(get('/api/auth/feature-access?feature=roster&team_id='+encodeURIComponent(name)),env);
   assert.equal(r.status,200);
   assert.equal((await r.json()).allowed,true);
 }
 r=await handleProductionAuth(get('/api/auth/feature-access?feature=roster&team_id=Unknown%20Team'),env);
 assert.equal(r.status,200);
 assert.equal((await r.json()).allowed,false,'Owner must not grant unknown team');
 r=await handleProductionAuth(get('/api/auth/feature-access?feature=pool&team_id=NSK%20Team%2018'),env);
 assert.equal(r.status,200);
 assert.equal((await r.json()).allowed,false,'Owner still requires feature grant');
 r=await handleProductionAuth(get('/api/auth/feature-access?feature=roster&team_id=NSK%20Team%2019'),env);
 assert.equal((await r.json()).allowed,false,'Out-of-season team is not verified');
 console.log('PASS production global-owner feature grants scoped by verified team and permission');
}finally{globalThis.fetch=oldFetch;}
