import assert from 'node:assert/strict';
import {handleProductionAuth} from './production-auth-boundary.js';

const origin='https://zprcsv92cy-cmyk.github.io';
const token='A'.repeat(43);
const target='11111111-1111-4111-8111-111111111111';
const root='22222222-2222-4222-8222-222222222222';
let actorRole='owner',grants=['users:manage'],targetExists=true,protectedTarget=false,membershipExists=true;
const deletions=[];
const teams=[
  {id:18,Namn:'NSK Team 18','Säsong':'2026'},
  {id:27,Namn:'NSK Testlag 2','Säsong':'2026'},
  {id:28,Namn:'NSK Team 19','Säsong':'2025'}
];
const db={prepare(sql){return {bind(...args){return {
 first:async()=>{
   if(sql.includes('auth_sessions s'))return {id:root,display_name:'Owner'};
   if(sql.includes('SELECT id FROM auth_users WHERE id=?'))return targetExists?{id:target}:null;
   if(sql.includes('SELECT 1 AS protected'))return protectedTarget?{protected:1}:null;
   if(sql.startsWith('DELETE FROM auth_team_memberships')){
     deletions.push({sql,args});
     return membershipExists?{user_id:args[0]}:null;
   }
   return null;
 },
 all:async()=>({results:sql.includes('auth_team_memberships')?
   [{team_id:actorRole==='owner'?'*':'NSK Team 18',role:actorRole}]:
   grants.map(permission=>({permission}))})
 };}}}};
const env={AUTH_DB:db,BASEROW_TOKEN:'mock'};
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>Response.json({results:teams,next:null});
const send=(data,authenticated=true)=>new Request('https://nsk.invalid/api/auth/team-members',{
 method:'DELETE',headers:{Origin:origin,'Content-Type':'application/json',
 ...(authenticated?{Authorization:'Bearer '+token}:{})},
 body:JSON.stringify(data)
});
const payload={user_id:target,team_id:'NSK Team 18'};
try{
 let result=await handleProductionAuth(send(payload),env);
 assert.equal(result.status,200,await result.clone().text());
 assert.equal((await result.json()).removed,true);
 assert.equal(deletions.length,1);
 assert.deepEqual(deletions[0].args,[target,'NSK Team 18']);
 assert.match(deletions[0].sql,/WHERE user_id=\? AND team_id=\? RETURNING user_id/);
 membershipExists=false;
 result=await handleProductionAuth(send(payload),env);
 assert.equal(result.status,404,'Already missing team membership');
 membershipExists=true;
 const invalid=[
  {...payload,team_id:'*'},
  {...payload,team_id:'Unknown Team'},
  {...payload,team_id:'NSK Team 19'},
  {...payload,role:'coach'},
  {...payload,permissions:['users:manage']}
 ];
 for(const value of invalid){
   result=await handleProductionAuth(send(value),env);
   assert.equal(result.status,400,JSON.stringify(value));
 }
 result=await handleProductionAuth(send({...payload,user_id:root}),env);
 assert.equal(result.status,403);
 protectedTarget=true;
 result=await handleProductionAuth(send(payload),env);
 assert.equal(result.status,403);
 protectedTarget=false;
 actorRole='team_admin';
 result=await handleProductionAuth(send(payload),env);
 assert.equal(result.status,403);
 actorRole='owner';grants=[];
 result=await handleProductionAuth(send(payload),env);
 assert.equal(result.status,403);
 grants=['users:manage'];
 result=await handleProductionAuth(send(payload,false),env);
 assert.equal(result.status,401);
 targetExists=false;
 result=await handleProductionAuth(send(payload),env);
 assert.equal(result.status,404);
 assert.equal(deletions.length,2,'No unauthorized deletions');
 console.log('PASS owner-only verified team membership deletion and global-owner protection');
}finally{globalThis.fetch=oldFetch;}
