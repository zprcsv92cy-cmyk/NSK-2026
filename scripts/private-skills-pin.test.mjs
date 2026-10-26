import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {createPrivateSkillsHandler} from '../worker/private-skills-api.js';
import {PRIMARY_ADMIN_ID} from '../worker/primary-administrator.js';
async function setup(t){
 const f=await fixture(t);for(const sql of readFileSync(new URL('../migrations/20261026_private_skills_pin.sql',import.meta.url),'utf8').split(';').filter(s=>s.trim()))await f.db.prepare(sql).run();
 let primary=true,reads=0;
 const handler=createPrivateSkillsHandler(f.env,async()=>{reads++;return [{id:18,Namn:'NSK Team 18','Säsong':'2026'}];},{verifyIdentity:async token=>token==='invalid'?null:{user:{id:primary?PRIMARY_ADMIN_ID:'ordinary'},is_primary_admin:primary,is_global_admin:true,memberships:[{team_id:'NSK Team 18',role:'owner'}],permissions:['read']},readRoster:async()=>[]});
 const call=(method='GET',data,path='/api/skills/pin',unlock='',session='login-a')=>handler(new Request('https://test'+path,{method,headers:{Authorization:'Bearer '+session,'X-NSK-Skills-Unlock':unlock,...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}));
 return {...f,call,setPrimary:v=>primary=v,reads:()=>reads};
}
test('PIN first-use setup, protected APIs, session-bound proof, explicit lock and expiry use real SQLite',async t=>{
 const f=await setup(t);assert.deepEqual(await(await f.call()).json(),{ok:true,configured:false,retryAfter:0});
 for(const [method,body,path] of [['GET',null,'/api/skills?team_id=18'],['PUT',{revision:0},'/api/skills?team_id=18'],['DELETE',{revision:0},'/api/skills?team_id=18'],['POST',{},'/api/skills/suggest?team_id=18']])assert.equal((await f.call(method,body,path)).status,423);
 assert.equal(f.reads(),0);
 assert.equal((await f.call('POST',{action:'setup',pin:'123',confirmPin:'123'})).status,400);
 assert.equal((await f.call('POST',{action:'setup',pin:'7392',confirmPin:'7391'})).status,400);
 const created=await f.call('POST',{action:'setup',pin:'7392',confirmPin:'7392'});assert.equal(created.status,200);assert.match(created.headers.get('Cache-Control'),/no-store/);const proof=await created.json();assert.match(proof.unlock,/^[a-f0-9]{64}$/);
 const pinRow=await f.db.prepare('SELECT * FROM private_skills_pin').first();assert.notEqual(pinRow.pin_hash,'7392');assert.equal(pinRow.pin_hash.length,64);
 const grant=await f.db.prepare('SELECT * FROM private_skills_unlocks').first();assert.notEqual(grant.grant_hash,proof.unlock);assert.notEqual(grant.session_hash,'login-a');
 assert.equal((await f.call('POST',{action:'setup',pin:'9999',confirmPin:'9999'})).status,409);
 assert.equal((await f.call('GET',null,'/api/skills?team_id=999',proof.unlock)).status,403); // proof passed, team independently denied
 assert.equal((await f.call('GET',null,'/api/skills?team_id=999',proof.unlock,'login-b')).status,423);
 assert.equal((await f.call('DELETE')).status,200);assert.equal((await f.call('GET',null,'/api/skills?team_id=999',proof.unlock)).status,423);
 const unlocked=await(await f.call('POST',{action:'unlock',pin:'7392'})).json();assert(unlocked.unlock);await f.db.prepare('UPDATE private_skills_unlocks SET expires_at=0').run();assert.equal((await f.call('GET',null,'/api/skills?team_id=999',unlocked.unlock)).status,423);
 f.setPrimary(false);for(const method of ['GET','POST','DELETE'])assert.equal((await f.call(method,method==='POST'?{action:'unlock',pin:'7392'}:null)).status,403);f.setPrimary(true);assert.equal((await f.call('GET',null,'/api/skills/pin','','invalid')).status,401);
});
test('PIN attempt reservation prevents concurrent brute force and survives login changes; expiry restores five attempts',async t=>{
 const f=await setup(t);await f.call('POST',{action:'setup',pin:'7392',confirmPin:'7392'});
 const results=await Promise.all(Array.from({length:10},(_,i)=>f.call('POST',{action:'unlock',pin:'0000'},'/api/skills/pin','',i%2?'login-a':'login-b')));
 assert.equal(results.filter(r=>r.status===403).length,4);assert.equal(results.filter(r=>r.status===429).length,6);const row=await f.db.prepare('SELECT attempts,locked_until FROM private_skills_pin').first();assert.equal(row.attempts,5);assert(row.locked_until>Math.floor(Date.now()/1000));
 assert.equal((await f.call('POST',{action:'unlock',pin:'7392'})).status,429);await f.db.prepare('UPDATE private_skills_pin SET locked_until=0').run();assert.equal((await f.call('POST',{action:'unlock',pin:'7392'})).status,200);assert.equal((await f.db.prepare('SELECT attempts FROM private_skills_pin').first()).attempts,0);
});
