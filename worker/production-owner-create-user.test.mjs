import assert from 'node:assert/strict';
import {handleProductionAuth} from './production-auth-boundary.js';
const origin='https://zprcsv92cy-cmyk.github.io',token='A'.repeat(43);
let writes=[],existing=false,role='owner',permissions=['users:manage'];
const db={prepare(sql){return {bind(...args){return {
 first:async()=>sql.includes('SELECT id FROM auth_users WHERE email')?
   (existing?{id:'existing'}:null):{id:'root',display_name:'Owner'},
 all:async()=>({results:sql.includes('auth_team_memberships')?
   [{team_id:role==='owner'?'*':'NSK Team 18',role}]:
   permissions.map(permission=>({permission}))}),
 run:async()=>{writes.push({sql,args});return {success:true};}
 };}}}};
const env={AUTH_DB:db};
const send=(data,{bearer=true}={})=>new Request('https://nsk.invalid/api/auth/users',{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json',
 ...(bearer?{Authorization:'Bearer '+token}:{})},
 body:JSON.stringify(data)
});
let r=await handleProductionAuth(send({email:'New.User@NSK.INVALID',name:'  New Coach  '}),env);
assert.equal(r.status,201);
let json=await r.json();
assert.equal(json.disabled,true);
assert.equal(json.setup_required,true);
assert.deepEqual(json.permissions,[]);
assert.equal(writes.length,1);
assert.match(writes[0].sql,/INSERT INTO auth_users/);
assert.deepEqual(writes[0].args.slice(1),['new.user@nsk.invalid','New Coach','pending-setup']);
existing=true;
r=await handleProductionAuth(send({email:'new.user@nsk.invalid',name:'Other'}),env);
assert.equal(r.status,409);
existing=false;
for(const data of [
 {email:'new@nsk.invalid',name:'New',permissions:['users:manage']},
 {email:'new@nsk.invalid',name:'New',role:'owner'},
 {email:'bad',name:'New'},
 {email:'new@nsk.invalid',name:''}
]){r=await handleProductionAuth(send(data),env);assert.equal(r.status,400);}
role='team_admin';
r=await handleProductionAuth(send({email:'new@nsk.invalid',name:'New'}),env);
assert.equal(r.status,403);
role='owner';permissions=[];
r=await handleProductionAuth(send({email:'new@nsk.invalid',name:'New'}),env);
assert.equal(r.status,403);
permissions=['users:manage'];
r=await handleProductionAuth(send({email:'new@nsk.invalid',name:'New'},{bearer:false}),env);
assert.equal(r.status,401);
assert.equal(writes.length,1,'Denials must not write');
console.log('PASS owner creates only disabled, unprivileged user; duplicate, role injection, team admin denied');
