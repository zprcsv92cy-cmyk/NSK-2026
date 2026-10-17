import assert from 'node:assert/strict';
import {handleProductionAuth} from './production-auth-boundary.js';
const token='A'.repeat(43),origin='https://zprcsv92cy-cmyk.github.io';
const target='11111111-1111-4111-8111-111111111111',root='22222222-2222-4222-8222-222222222222';
let actorRole='owner',protectedTarget=false,exists=true,duplicate=false,writes=[],batches=0;
const db={prepare(sql){return {
 bind(...args){return {
 first:async()=>{
  if(sql.includes('auth_sessions s'))return {id:root,display_name:'Owner'};
  if(sql.includes('SELECT id FROM auth_users WHERE email=? AND id<>?'))return duplicate?{id:'other'}:null;
  if(sql.includes('SELECT id FROM auth_users WHERE id=?'))return exists?{id:target}:null;
  if(sql.includes('SELECT 1 AS protected'))return protectedTarget?{protected:1}:null;
  return null;
 },
 all:async()=>({results:sql.includes('auth_team_memberships')?[{team_id:actorRole==='owner'?'*':'NSK Team 18',role:actorRole}]:[{permission:'users:manage'}]}),
 run:async()=>{writes.push({sql,args});return {success:true};}
 };},
 };},
 batch:async statements=>{batches++;return statements.map(()=>({success:true}));}};
const env={AUTH_DB:db};
const req=(id,method,body,authenticated=true)=>new Request('https://nsk.invalid/api/auth/users/'+id,{
 method,headers:{Origin:origin,...(authenticated?{Authorization:'Bearer '+token}:{}),
 ...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})
});
const edit={email:'new@nsk.invalid',name:'New User'};
let r=await handleProductionAuth(req(target,'PATCH',edit),env);
assert.equal(r.status,200);assert.equal(writes.length,1);assert.match(writes[0].sql,/UPDATE auth_users/);
r=await handleProductionAuth(req(target,'PATCH',{...edit,role:'owner'}),env);
assert.equal(r.status,400);
duplicate=true;r=await handleProductionAuth(req(target,'PATCH',edit),env);assert.equal(r.status,409);duplicate=false;
protectedTarget=true;
for(const method of ['PATCH','DELETE']){
 r=await handleProductionAuth(req(target,method,method==='PATCH'?edit:null),env);
 assert.equal(r.status,403);
}
protectedTarget=false;
for(const method of ['PATCH','DELETE']){
 r=await handleProductionAuth(req(root,method,method==='PATCH'?edit:null),env);
 assert.equal(r.status,403);
}
actorRole='team_admin';
r=await handleProductionAuth(req(target,'DELETE'),env);assert.equal(r.status,403);
actorRole='owner';
r=await handleProductionAuth(req(target,'DELETE',null,false),env);assert.equal(r.status,401);
exists=false;r=await handleProductionAuth(req(target,'DELETE'),env);assert.equal(r.status,404);exists=true;
assert.equal(batches,0);
r=await handleProductionAuth(req(target,'DELETE'),env);assert.equal(r.status,200);
assert.equal(batches,1);
assert.equal(writes.length,1,'Denied attempts must not write');
console.log('PASS owner edit/delete: self, protected owner, unauthorized role, duplicates and privilege injection blocked');
