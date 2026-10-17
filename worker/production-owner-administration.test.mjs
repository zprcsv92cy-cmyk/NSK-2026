import assert from 'node:assert/strict';
import {handleProductionAuth} from './production-auth-boundary.js';

const token='A'.repeat(43);
const origin='https://zprcsv92cy-cmyk.github.io';
let writes=0;
const membership=[{team_id:'*',role:'owner'}];
const grants=[{permission:'users:manage'}];
const db={prepare(sql){return {bind(){return {
  first:async()=>({id:'root',display_name:'Owner'}),
  all:async()=>({results:sql.includes('auth_team_memberships')?membership:grants})
};},
all:async()=>{
 if(sql.includes('FROM auth_users'))return {results:[{id:'root',email:'owner@example.invalid',display_name:'Owner',disabled:0}]};
 if(sql.includes('FROM auth_user_permissions'))return {results:[{user_id:'root',permission:'users:manage'}]};
 if(sql.includes('FROM auth_team_memberships'))return {results:[{user_id:'root',team_id:'*',role:'owner'}]};
 throw Error('Unexpected SQL');
},run:async()=>{writes++;}};}};
const env={AUTH_DB:db};
const req=(path,method='GET',auth=true)=>new Request('https://nsk.invalid'+path,{
 method,headers:{Origin:origin,...(auth?{Authorization:'Bearer '+token}:{})}
});
let r=await handleProductionAuth(req('/api/auth/users'),env);
assert.equal(r.status,200);
assert.equal((await r.json()).users[0].email,'owner@example.invalid');
r=await handleProductionAuth(req('/api/auth/team-members'),env);
assert.equal(r.status,200);
assert.equal((await r.json()).memberships[0].role,'owner');
membership[0]={team_id:'NSK Team 18',role:'team_admin'};
r=await handleProductionAuth(req('/api/auth/users'),env);
assert.equal(r.status,403,'Team admin is not global owner');
membership[0]={team_id:'*',role:'owner'};
grants.splice(0);
r=await handleProductionAuth(req('/api/auth/users'),env);
assert.equal(r.status,403,'Global owner still needs users:manage');
grants.push({permission:'users:manage'});
r=await handleProductionAuth(req('/api/auth/users','GET',false),env);
assert.equal(r.status,401);
for(const path of ['/api/auth/team-members']){
 r=await handleProductionAuth(req(path,'POST'),env);
 assert.equal(r.status,405,'Writes must remain blocked: '+path);
}
r=await handleProductionAuth(req('/api/auth/users'),{});
assert.equal(r.status,503,'Missing AUTH_DB must fail closed');
assert.equal(writes,0,'No test should perform a write');
console.log('PASS global owner production reads, role+grant and blocked membership writes');
