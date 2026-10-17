import assert from 'node:assert/strict';
import {pbkdf2Sync,webcrypto} from 'node:crypto';
import {handleProductionAuth} from './production-auth-boundary.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='https://zprcsv92cy-cmyk.github.io';
const email='owner@nsk.invalid';
const password='owner-password-2026';
const salt=Buffer.alloc(16,7);
const passwordHash='pbkdf2-sha256$100000$'+salt.toString('hex')+'$'+
 pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
let active=true,revoked=false,teamCalls=0,attempts=0,grants=['read','roster:manage'];
const env={BASEROW_TOKEN:'mock',AUTH_DB:{prepare(sql){return {bind(...args){return {
 first:async()=>{
  if(sql.startsWith('INSERT INTO auth_login_attempts'))return {attempts:++attempts};
  if(sql.startsWith('SELECT id,password_hash,disabled FROM auth_users'))
   return args[0]===email?{id:'root',password_hash:passwordHash,disabled:!active?1:0}:null;
  if(sql.includes('FROM auth_sessions s')){
   return active&&!revoked?{id:'root',display_name:'Global Owner'}:null;
  }
  return null;
 },
 all:async()=>({results:sql.includes('auth_team_memberships')
  ?[{team_id:'*',role:'owner'}]
  :grants.map(permission=>({permission}))}),
 run:async()=>{
  if(sql.startsWith('UPDATE auth_sessions SET revoked_at'))revoked=true;
  return {success:true};
 }
 };}}}}};
const oldFetch=globalThis.fetch;
globalThis.fetch=async resource=>{
 assert.match(String(resource),/api.baserow.io/);
 teamCalls++;
 return Response.json({results:[
  {id:18,Namn:'NSK Team 18','Säsong':'2026'},
  {id:27,Namn:'NSK Testlag 2','Säsong':'2026'},
  {id:99,Namn:'NSK Team 19','Säsong':'2025'}],next:null});
};
const request=(path,method='GET',body=null,token=null)=>new Request('https://nsk.invalid'+path,{
 method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),
  ...(token?{Authorization:'Bearer '+token}:{})},
 ...(body?{body:JSON.stringify(body)}:{})
});
try{
 let result=await handleProductionAuth(request('/api/auth/me'),env);
 assert.equal(result.status,401,'Must deny before login');
 result=await handleProductionAuth(request('/api/auth/login','POST',{email,password:'wrong'}),env);
 assert.equal(result.status,401);
 result=await handleProductionAuth(request('/api/auth/login','POST',{email,password}),env);
 assert.equal(result.status,200);
 const session=(await result.json()).token;
 assert.match(session,/^[A-Za-z0-9_-]{32,256}$/);
 result=await handleProductionAuth(request('/api/auth/me','GET',null,session),env);
 assert.equal(result.status,200);
 const identity=await result.json();
 assert.deepEqual(identity.memberships.map(x=>x.team_id),['NSK Team 18','NSK Testlag 2']);
 assert.equal(identity.user.name,'Global Owner');
 for(const team of ['NSK Team 18','NSK Testlag 2']){
  result=await handleProductionAuth(request('/api/auth/feature-access?feature=roster&team_id='+encodeURIComponent(team),'GET',null,session),env);
  assert.equal(result.status,200);
  assert.equal((await result.json()).allowed,true);
 }
 result=await handleProductionAuth(request('/api/auth/feature-access?feature=roster&team_id=Unknown','GET',null,session),env);
 assert.equal((await result.json()).allowed,false);
 grants=['read'];
 result=await handleProductionAuth(request('/api/auth/feature-access?feature=roster&team_id=NSK%20Team%2018','GET',null,session),env);
 assert.equal((await result.json()).allowed,false,'Owner without specific grant denied');
 result=await handleProductionAuth(request('/api/auth/logout','POST',null,session),env);
 assert.equal(result.status,200);
 result=await handleProductionAuth(request('/api/auth/me','GET',null,session),env);
 assert.equal(result.status,401,'Revoked session must be rejected');
 assert.ok(teamCalls>0);
 active=false;
 result=await handleProductionAuth(request('/api/auth/login','POST',{email,password}),env);
 assert.equal(result.status,401,'Disabled account cannot log in');
 console.log('PASS owner login, session, verified team access, permission denial, logout and disabled account');
}finally{globalThis.fetch=oldFetch;}
