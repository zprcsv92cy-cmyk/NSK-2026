import assert from 'node:assert/strict';
import {handleProductionAuth} from './production-auth-boundary.js';

const origin='https://zprcsv92cy-cmyk.github.io',token='A'.repeat(43);
const target='11111111-1111-4111-8111-111111111111';
const root='22222222-2222-4222-8222-222222222222';
let role='owner',grants=['users:manage'],targetExists=true,protectedTarget=false,writes=[];
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
  return null;
 },
 all:async()=>({results:sql.includes('auth_team_memberships')?
   [{team_id:role==='owner'?'*':'NSK Team 18',role}]:
   grants.map(permission=>({permission}))}),
 run:async()=>{writes.push({sql,args});return {success:true};}
 };}}}};
const env={AUTH_DB:db,BASEROW_TOKEN:'mock'};
const oldFetch=globalThis.fetch;
globalThis.fetch=async()=>Response.json({results:teams,next:null});
const send=(data,auth=true)=>new Request('https://nsk.invalid/api/auth/team-members',{
 method:'PUT',headers:{Origin:origin,'Content-Type':'application/json',
 ...(auth?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)
});
const valid={user_id:target,team_id:'NSK Team 18',role:'coach'};
try{
 let response=await handleProductionAuth(send(valid),env);
 assert.equal(response.status,200,await response.clone().text());
 assert.equal(writes.length,1);
 assert.deepEqual(writes[0].args,[target,'NSK Team 18','coach']);
 assert.match(writes[0].sql,/ON CONFLICT/);
 response=await handleProductionAuth(send({...valid,team_id:'NSK Testlag 2',role:'team_admin'}),env);
 assert.equal(response.status,200);
 assert.equal(writes.length,2);
 for(const data of [
   {...valid,team_id:'*',role:'owner'},
   {...valid,role:'owner'},
   {...valid,role:'superadmin'},
   {...valid,team_id:'Unknown Team'},
   {...valid,team_id:'NSK Team 19'},
   {...valid,role:'coach',permissions:['users:manage']},
 ]) {
   response=await handleProductionAuth(send(data),env);
   assert.equal(response.status,400,JSON.stringify(data));
 }
 response=await handleProductionAuth(send({...valid,user_id:root}),env);
 assert.equal(response.status,403,'Self membership protected');
 protectedTarget=true;
 response=await handleProductionAuth(send(valid),env);
 assert.equal(response.status,403,'Other owner protected');
 protectedTarget=false;role='team_admin';
 response=await handleProductionAuth(send(valid),env);
 assert.equal(response.status,403,'Team admin cannot assign roles');
 role='owner';grants=[];
 response=await handleProductionAuth(send(valid),env);
 assert.equal(response.status,403,'Global owner needs users grant');
 grants=['users:manage'];
 response=await handleProductionAuth(send(valid,false),env);
 assert.equal(response.status,401);
 targetExists=false;
 response=await handleProductionAuth(send(valid),env);
 assert.equal(response.status,404);
 assert.equal(writes.length,2,'Denied requests must never write');
 console.log('PASS global owner can manage verified team roles without handing out global owner role');
}finally{globalThis.fetch=oldFetch;}
