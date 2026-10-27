import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {handleTeamAuth} from '../worker/team-auth.js';
import {verifyStagingSession} from '../worker/staging-session-identity.js';
import {FEATURE_PERMISSIONS,authorizeTeamFeature} from '../worker/team-authorization-policy.js';
import {tokenDigest} from '../worker/account-recovery.js';

test('same active coach session picks up grants, revocations and lost membership on the next request',async t=>{
 const f=await fixture(t),token=f.tokens.user;
 const request=(path)=>new Request('https://auth.example/api/auth/'+path,{headers:{Authorization:'Bearer '+token}});
 await f.db.prepare('UPDATE auth_team_memberships SET role=? WHERE user_id=?').bind('coach',f.user).run();
 for(const permission of Object.values(FEATURE_PERMISSIONS).filter(p=>p!=='users:manage'))await f.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(f.user,permission).run();
 for(const [feature,permission] of Object.entries(FEATURE_PERMISSIONS)){
  const response=await handleTeamAuth(request('feature-access?team_id=NSK%20Team%2018&feature='+feature),f.env);
  assert.equal(response.status,feature==='users'?403:200,feature);
  const actor=await verifyStagingSession(token,f.env);
  assert.equal(authorizeTeamFeature(actor,'NSK Team 18',feature).allowed,feature!=='users',permission);
 }
 assert.equal((await handleTeamAuth(request('users'),f.env)).status,403);
 await f.db.prepare('DELETE FROM auth_user_permissions WHERE user_id=? AND permission=?').bind(f.user,'roster:manage').run();
 assert.equal((await handleTeamAuth(request('feature-access?team_id=NSK%20Team%2018&feature=roster'),f.env)).status,403);
 assert.equal(authorizeTeamFeature(await verifyStagingSession(token,f.env),'NSK Team 18','roster').allowed,false);
 await f.db.prepare('DELETE FROM auth_team_memberships WHERE user_id=?').bind(f.user).run();
 assert.equal((await handleTeamAuth(request('feature-access?team_id=NSK%20Team%2018&feature=lineup'),f.env)).status,403);
});

test('disabled, revoked and expired real SQLite sessions are rejected by both auth and API identity verification',async t=>{
 const f=await fixture(t),token=f.tokens.user,hash=await tokenDigest(token);
 const me=()=>handleTeamAuth(new Request('https://auth.example/api/auth/me',{headers:{Authorization:'Bearer '+token}}),f.env);
 assert.equal((await me()).status,200);assert(await verifyStagingSession(token,f.env));
 await f.db.prepare('UPDATE auth_users SET disabled=1 WHERE id=?').bind(f.user).run();
 assert.equal((await me()).status,401);assert.equal(await verifyStagingSession(token,f.env),null);
 await f.db.prepare('UPDATE auth_users SET disabled=0 WHERE id=?').bind(f.user).run();
 await f.db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE token_hash=?").bind(hash).run();
 assert.equal((await me()).status,401);assert.equal(await verifyStagingSession(token,f.env),null);
 await f.db.prepare("UPDATE auth_sessions SET revoked_at=NULL,expires_at=datetime('now','-1 minute') WHERE token_hash=?").bind(hash).run();
 assert.equal((await me()).status,401);assert.equal(await verifyStagingSession(token,f.env),null);
});
