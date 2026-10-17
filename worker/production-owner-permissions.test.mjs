import assert from 'node:assert/strict';
import {handleProductionAuth} from './production-auth-boundary.js';
const root='22222222-2222-4222-8222-222222222222';
const user='11111111-1111-4111-8111-111111111111';
let role='owner',grants=['users:manage'],protectedTarget=false,targetExists=true,batches=[];
const db={
 prepare(sql){return {bind(...args){return {
  first:async()=>{
   if(sql.includes('auth_sessions s'))return {id:root,display_name:'Owner'};
   if(sql.includes('SELECT id FROM auth_users'))return targetExists?{id:user}:null;
   if(sql.includes('SELECT 1 AS protected'))return protectedTarget?{protected:1}:null;
   return null;
  },
  all:async()=>({results:sql.includes('auth_team_memberships')?
    [{team_id:role==='owner'?'*':'NSK Team 18',role}]:
    grants.map(permission=>({permission}))})
 };}};},
 batch:async statements=>{batches.push(statements);return statements.map(()=>({success:true}));}
};
const env={AUTH_DB:db},token='A'.repeat(43),origin='https://zprcsv92cy-cmyk.github.io';
const req=(id,permissions,auth=true)=>new Request('https://nsk.invalid/api/auth/users/'+id+'/permissions',{
 method:'PUT',headers:{Origin:origin,'content-type':'application/json',
 ...(auth?{Authorization:'Bearer '+token}:{})},
 body:JSON.stringify(permissions)
});
let response=await handleProductionAuth(req(user,{permissions:['read','lineup:edit']}),env);
assert.equal(response.status,200);
assert.deepEqual((await response.json()).permissions,['read','lineup:edit']);
assert.equal(batches.length,1);
for(const body of [
 {permissions:['read','read']},{permissions:['superadmin']},
 {permissions:['read'],role:'owner'},{permissions:'read'},
 {permissions:Array(10).fill('read')}
]){response=await handleProductionAuth(req(user,body),env);assert.equal(response.status,400);}
response=await handleProductionAuth(req(root,{permissions:[]}),env);
assert.equal(response.status,403);
protectedTarget=true;
response=await handleProductionAuth(req(user,{permissions:[]}),env);
assert.equal(response.status,403);
protectedTarget=false;role='team_admin';
response=await handleProductionAuth(req(user,{permissions:[]}),env);
assert.equal(response.status,403);
role='owner';grants=[];
response=await handleProductionAuth(req(user,{permissions:[]}),env);
assert.equal(response.status,403);
grants=['users:manage'];
response=await handleProductionAuth(req(user,{permissions:[]},false),env);
assert.equal(response.status,401);
targetExists=false;
response=await handleProductionAuth(req(user,{permissions:[]}),env);
assert.equal(response.status,404);
assert.equal(batches.length,1,'Denied permission mutations must never write');
console.log('PASS production user grants: owner-only, protected owner, no injection, no duplicate grants');
