import test from 'node:test';import assert from 'node:assert/strict';import worker from '../worker/production-entry.js';import {fixture} from './helpers/auth-d1-fixture.mjs';import {tokenDigest} from '../worker/account-recovery.js';
const origin='https://zprcsv92cy-cmyk.github.io';
async function api(f,path,method='GET',body,actor='root',extra={}){
 const headers={Origin:origin,...(actor?{Authorization:'Bearer '+f.tokens[actor]}:{}),...(body?{'Content-Type':'application/json'}:{}),...extra};
 const response=await worker.fetch(new Request('https://auth.test/api/auth'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),f.env);
 const result=await response.json().catch(()=>({}));return {status:response.status,body:result,response};
}
test('anonymous administration is denied and cross-origin/body limits are enforced',async t=>{
 const f=await fixture(t);
 for(const [p,m,b] of [['/users','GET'],['/users','POST',{name:'X'}],['/users/'+f.user,'DELETE'],['/users/'+f.user+'/permissions','PUT',{permissions:[]}],['/users/'+f.user+'/password-token','POST']])assert.equal((await api(f,p,m,b,null)).status,403,p);
 assert.equal((await api(f,'/users','GET',undefined,'root',{Origin:'https://other.test'})).status,403);
 assert.equal((await api(f,'/forgot-password','POST',{email:'x'.repeat(9000)},null)).status,413);
 assert.equal((await api(f,'/users','OPTIONS',undefined,null)).status,204);
});
test('administrator creates an inactive account, membership and selected grants atomically',async t=>{
 const f=await fixture(t),data={name:'New User',email:'new@example.invalid',team_id:'NSK Team 18',role:'coach',permissions:['read','lineup:edit']};
 const created=await api(f,'/users','POST',data);assert.equal(created.status,201);assert.equal(created.body.setup_required,true);
 assert.equal((await f.db.prepare('SELECT role FROM auth_team_memberships WHERE user_id=?').bind(created.body.id).first()).role,'coach');
 assert.equal((await f.db.prepare('SELECT permission FROM auth_user_permissions WHERE user_id=?').bind(created.body.id).all()).results.length,2);
 assert.equal((await api(f,'/users','POST',data)).status,409);
 assert.equal((await api(f,'/users','POST',{...data,email:'invalid@example.invalid',permissions:['arbitrary:admin']})).status,400);
 assert.equal(await f.db.prepare('SELECT id FROM auth_users WHERE email=?').bind('invalid@example.invalid').first(),null);
});
test('grants can be assigned and removed immediately without deleting the account',async t=>{
 const f=await fixture(t);
 assert.equal((await api(f,'/users/'+f.user+'/permissions','PUT',{permissions:['read','pool:create']})).status,200);
 assert.ok((await api(f,'/me','GET',undefined,'user')).body.permissions.includes('pool:create'));
 assert.equal((await api(f,'/users/'+f.user+'/permissions','PUT',{permissions:['read']})).status,200);
 assert.deepEqual((await api(f,'/me','GET',undefined,'user')).body.permissions,['read']);
 assert.equal((await api(f,'/users/'+f.root+'/permissions','PUT',{permissions:[]})).status,409);
});
test('delegated managers cannot change, delete, disable or reset a head administrator',async t=>{
 const f=await fixture(t);
 for(const [path,method,body] of [['/users/'+f.root,'DELETE'],['/users/'+f.root,'PATCH',{name:'Changed',email:'root@example.invalid'}],['/users/'+f.root+'/permissions','PUT',{permissions:[]}],['/users/'+f.root+'/status','PATCH',{disabled:true}],['/users/'+f.root+'/password-token','POST']])assert.equal((await api(f,path,method,body,'delegate')).status,403,path);
 assert.equal((await api(f,'/users/'+f.root,'DELETE')).status,400);
 assert.equal((await api(f,'/users/'+f.root+'/status','PATCH',{disabled:true})).status,400);
});
test('account deletion removes login data and grants; membership can be removed separately',async t=>{
 const f=await fixture(t);
 assert.equal((await api(f,'/team-members','DELETE',{user_id:f.user,team_id:'NSK Team 18'})).status,200);
 assert.equal((await api(f,'/me','GET',undefined,'user')).body.memberships.length,0);
 assert.equal((await api(f,'/users/'+f.user,'DELETE')).status,200);
 for(const table of ['auth_users','auth_sessions','auth_user_permissions'])assert.equal((await f.db.prepare('SELECT count(*) AS n FROM '+table+' WHERE '+(table==='auth_users'?'id':'user_id')+'=?').bind(f.user).first()).n,0);
 assert.equal((await api(f,'/me','GET',undefined,'user')).status,401);
});
test('invitation activates once and produces a two-hour login session',async t=>{
 const f=await fixture(t);const created=await api(f,'/users','POST',{name:'Invited',email:'invite@example.invalid'});
 const invitation=await api(f,'/users/'+created.body.id+'/setup-token','POST');assert.equal(invitation.status,200);
 const stored=await f.db.prepare('SELECT token_hash FROM auth_setup_tokens WHERE user_id=?').bind(created.body.id).first();assert.notEqual(stored.token_hash,invitation.body.token);
 const activation={token:invitation.body.token,password:'New invited password 2026!'};
 assert.equal((await api(f,'/activate','POST',activation,null)).status,200);
 assert.equal((await api(f,'/activate','POST',activation,null)).status,400);
 const login=await api(f,'/login','POST',{email:'invite@example.invalid',password:activation.password},null);assert.equal(login.status,200);
 const row=await f.db.prepare("SELECT (julianday(expires_at)-julianday('now'))*86400 AS seconds FROM auth_sessions WHERE token_hash=?").bind(await tokenDigest(login.body.token)).first();assert.ok(row.seconds>7100&&row.seconds<=7201);
});
test('password reset preserves grants and revokes old sessions; old and reused credentials fail',async t=>{
 const f=await fixture(t),reset=await api(f,'/users/'+f.user+'/password-token','POST');assert.equal(reset.status,200);
 assert.equal((await api(f,'/me','GET',undefined,'user')).status,200);
 const data={token:reset.body.token,password:'Changed user password 2026!'};
 assert.equal((await api(f,'/reset-password','POST',data,null)).status,200);
 assert.equal((await api(f,'/me','GET',undefined,'user')).status,401);
 assert.equal((await api(f,'/reset-password','POST',data,null)).status,400);
 assert.equal((await api(f,'/login','POST',{email:'user@example.invalid',password:f.password},null)).status,401);
 assert.equal((await api(f,'/login','POST',{email:'user@example.invalid',password:data.password},null)).status,200);
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM auth_user_permissions WHERE user_id=?').bind(f.user).first()).n,1);
});
test('expired links and disabled accounts cannot reset or activate',async t=>{
 const f=await fixture(t),reset=await api(f,'/users/'+f.user+'/password-token','POST');
 await f.db.prepare("UPDATE auth_password_reset_tokens SET expires_at=datetime('now','-1 minute') WHERE user_id=?").bind(f.user).run();
 assert.equal((await api(f,'/reset-password','POST',{token:reset.body.token,password:'Unusable expired password'},null)).status,400);
 const fresh=await api(f,'/users/'+f.user+'/password-token','POST');await api(f,'/users/'+f.user+'/status','PATCH',{disabled:true});
 assert.equal((await api(f,'/reset-password','POST',{token:fresh.body.token,password:'Unusable disabled password'},null)).status,400);
 assert.equal((await api(f,'/users/'+f.user+'/setup-token','POST')).status,409);
});
test('forgot-password does not disclose accounts and creates an administrator request only for an active account',async t=>{
 const f=await fixture(t),known=await api(f,'/forgot-password','POST',{email:'user@example.invalid'},null),unknown=await api(f,'/forgot-password','POST',{email:'absent@example.invalid'},null);
 assert.equal(known.status,202);assert.deepEqual(known.body,unknown.body);assert.equal((await api(f,'/account-options','GET',undefined,null)).body.email_delivery,false);
 const listed=await api(f,'/users');assert.ok(listed.body.users.find(u=>u.id===f.user).recovery_requested_at);assert.equal(listed.body.email_delivery,false);
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM auth_recovery_requests').first()).n,1);
 for(let i=0;i<4;i++)assert.equal((await api(f,'/forgot-password','POST',{email:'user@example.invalid'},null)).status,202);
});
test('change-password requires the current password and signs out all sessions',async t=>{
 const f=await fixture(t),body={current_password:'Wrong password',password:'Own changed password 2026!'};
 assert.equal((await api(f,'/change-password','POST',body,'user')).status,400);
 assert.equal((await api(f,'/change-password','POST',{...body,current_password:f.password},'user')).status,200);
 assert.equal((await api(f,'/me','GET',undefined,'user')).status,401);
});
test('email delivery is disabled without configuration and a configured sender uses the persisted recipient',async t=>{
 const f=await fixture(t);
 assert.equal((await api(f,'/users/'+f.user+'/send-link','POST')).status,503);
 let sent;f.env.ACCOUNT_EMAIL_FROM='accounts@example.invalid';f.env.ACCOUNT_EMAIL={send:async message=>{sent=message;}};
 const result=await api(f,'/users/'+f.user+'/send-link','POST',{email:'attacker@example.invalid'});assert.equal(result.status,200);assert.equal(sent.to,'user@example.invalid');assert.ok(sent.text.includes('/aktivera/#token='));assert.equal(result.body.token,undefined);
});

test('concurrent use of the same reset link changes the password only once',async t=>{
 const f=await fixture(t),reset=await api(f,'/users/'+f.user+'/password-token','POST');
 const body={token:reset.body.token,password:'Concurrent reset password 2026!'};
 const results=await Promise.all([api(f,'/reset-password','POST',body,null),api(f,'/reset-password','POST',body,null)]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
});
test('changing an account email invalidates old sessions and outstanding password links',async t=>{
 const f=await fixture(t),reset=await api(f,'/users/'+f.user+'/password-token','POST');
 assert.equal((await api(f,'/users/'+f.user,'PATCH',{name:'User renamed',email:'changed@example.invalid'})).status,200);
 assert.equal((await api(f,'/me','GET',undefined,'user')).status,401);
 assert.equal((await api(f,'/reset-password','POST',{token:reset.body.token,password:'Obsolete email password 2026!'},null)).status,400);
 assert.equal((await api(f,'/login','POST',{email:'changed@example.invalid',password:f.password},null)).status,200);
});

test('Peter is the protected primary administrator and retains all rights without stored grants or memberships',async t=>{
 const f=await fixture(t);const {PRIMARY_ADMIN_ID,PRIMARY_ADMIN_EMAIL,ALL_ACCOUNT_PERMISSIONS}=await import('../worker/primary-administrator.js');
 await f.db.prepare('INSERT INTO auth_users VALUES(?,?,?,?,0)').bind(PRIMARY_ADMIN_ID,PRIMARY_ADMIN_EMAIL,'Peter Hasselberg','not-used-in-this-session-test').run();
 const token='protected-primary-administrator-token-2026';await f.db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+2 hours'))").bind(await tokenDigest(token),PRIMARY_ADMIN_ID).run();f.tokens.peter=token;
 const me=await api(f,'/me','GET',undefined,'peter');assert.equal(me.status,200);assert.equal(me.body.is_primary_admin,true);assert.deepEqual(me.body.permissions,ALL_ACCOUNT_PERMISSIONS);
 assert.equal((await api(f,'/users','GET',undefined,'peter')).status,200);
 for(const [path,method,body] of [['/users/'+PRIMARY_ADMIN_ID,'DELETE'],['/users/'+PRIMARY_ADMIN_ID+'/status','PATCH',{disabled:true}],['/users/'+PRIMARY_ADMIN_ID+'/permissions','PUT',{permissions:['read']}],['/users/'+PRIMARY_ADMIN_ID,'PATCH',{name:'Other',email:'other@example.invalid'}],['/team-members','DELETE',{user_id:PRIMARY_ADMIN_ID,team_id:'NSK Team 18'}]])assert.equal((await api(f,path,method,body,'peter')).status,409,path);
 assert.equal((await api(f,'/users/'+PRIMARY_ADMIN_ID+'/password-token','POST',undefined,'delegate')).status,403);
 const {createPersonalRosterIdentityVerifier}=await import('../worker/personal-roster-identity-adapter.js');const {authorizeTeamFeature}=await import('../worker/team-authorization-policy.js');
 const actor=await createPersonalRosterIdentityVerifier(f.env)(token);assert.equal(actor.is_primary_admin,true);for(const feature of ['pool','lineup','shifts','matches','pool_finish','pool_reopen','roster','users'])assert.equal(authorizeTeamFeature(actor,'NSK Team 18',feature).allowed,true,feature);
});
test('an email or a client flag alone does not confer primary administrator access',async()=>{
 const {PRIMARY_ADMIN_ID,PRIMARY_ADMIN_EMAIL,isPrimaryAdministrator}=await import('../worker/primary-administrator.js');
 assert.equal(isPrimaryAdministrator({id:'different-account',email:PRIMARY_ADMIN_EMAIL}),false);assert.equal(isPrimaryAdministrator({id:PRIMARY_ADMIN_ID,email:'other@example.invalid'}),false);
});
