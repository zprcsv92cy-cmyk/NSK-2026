import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../worker/production-entry.js';
import {fixture} from './helpers/auth-d1-fixture.mjs';
const defaults=['startsida','truppen','traningsgrupper'];
async function setup(t){const f=await fixture(t);await f.db.prepare(readFileSync(new URL('../migrations/20261027_navigation_preferences.sql',import.meta.url),'utf8')).run();f.env.NSK_PAGES_MIGRATION_ENABLED='true';return f;}
async function api(f,method='GET',body,actor='user',path='',origin='https://nsk18.pages.dev'){
 const response=await worker.fetch(new Request('https://auth.test/api/auth/navigation'+path,{method,headers:{Origin:origin,...(actor?{Authorization:'Bearer '+f.tokens[actor]}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),f.env);
 return {status:response.status,body:await response.json().catch(()=>({})),response};
}
test('personal menu defaults are read-only and anonymous, disabled and cross-origin requests are denied',async t=>{
 const f=await setup(t);assert.equal((await api(f,'GET',undefined,null)).status,401);
 const first=await api(f);assert.deepEqual(first.body,{shortcuts:defaults,revision:0});
 assert.equal((await f.db.prepare('SELECT count(*) AS n FROM auth_navigation_preferences').first()).n,0);
 assert.equal((await api(f,'GET',undefined,'user','','https://untrusted.test')).status,403);
 await f.db.prepare('UPDATE auth_users SET disabled=1 WHERE id=?').bind(f.user).run();
 assert.equal((await api(f)).status,401);
});
test('menu preferences follow the authenticated person across sessions and never a client-supplied user id',async t=>{
 const f=await setup(t),shortcuts=['materialforvaltare','startsida','truppen'];
 const saved=await api(f,'PUT',{shortcuts,revision:0});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);
 assert.deepEqual((await api(f)).body.shortcuts,shortcuts);
 assert.deepEqual((await api(f,'GET',undefined,'root')).body.shortcuts,defaults);
 assert.deepEqual((await api(f,'GET',undefined,'root','?user_id='+f.user)).body.shortcuts,defaults);
 assert.equal((await api(f,'PUT',{shortcuts,revision:0,user_id:f.root})).status,400);
 assert.equal((await api(f,'GET')).response.headers.get('Cache-Control'),'no-store');
});
test('menu validation blocks duplicates, private and flow routes, unauthorized pages, and invalid revisions',async t=>{
 const f=await setup(t);
 for(const shortcuts of [['truppen','truppen','startsida'],['skills','truppen','startsida'],['lag','truppen','startsida'],['skapapoolspel','truppen','startsida'],['anvandare','truppen','startsida'],['truppen'],null])
  assert.equal((await api(f,'PUT',{shortcuts,revision:0})).status,400);
 for(const revision of [-1,1.2,'0',null])assert.equal((await api(f,'PUT',{shortcuts:defaults,revision})).status,400);
 assert.equal((await api(f,'PUT',{shortcuts:defaults,revision:0})).status,200);
});
test('stale menu writes fail without erasing newer choices and reset uses the current revision',async t=>{
 const f=await setup(t),first=['ritverktyg','ovningsarkiv','startsida'];
 assert.equal((await api(f,'PUT',{shortcuts:first,revision:0})).status,200);
 assert.equal((await api(f,'PUT',{shortcuts:defaults,revision:0})).status,409);
 const [a,b]=await Promise.all([api(f,'PUT',{shortcuts:defaults,revision:1}),api(f,'PUT',{shortcuts:first,revision:1})]);
 assert.deepEqual([a.status,b.status].sort(),[200,409]);
 const current=await api(f);assert.equal(current.body.revision,2);
 assert.equal((await api(f,'PUT',{shortcuts:defaults,revision:2})).status,200);
 assert.deepEqual((await api(f)).body,{shortcuts:defaults,revision:3});
});
test('revoked page permissions remove a saved shortcut without granting access or rewriting preferences',async t=>{
 const f=await setup(t);
 assert.equal((await api(f,'PUT',{shortcuts:['anvandare','startsida','truppen'],revision:0},'root')).status,200);
 await f.db.prepare("DELETE FROM auth_user_permissions WHERE user_id=? AND permission='users:manage'").bind(f.root).run();
 const visible=await api(f,'GET',undefined,'root');assert.deepEqual(visible.body.shortcuts,defaults);assert.equal(visible.body.revision,1);
 const stored=await f.db.prepare('SELECT shortcuts_json FROM auth_navigation_preferences WHERE user_id=?').bind(f.root).first();assert.equal(JSON.parse(stored.shortcuts_json)[0],'anvandare');
});
test('frontend cache is scoped by account and auth service and filters unavailable or private routes',()=>{
 let identity={user:{id:'one'},permissions:['read']};
 const values=new Map(),localStorage={getItem:key=>values.get(key)||null};
 const window={APP_CONFIG:{AUTH_URL:'https://auth.example'},Auth:{getSession:()=>identity},addEventListener(){}};
 const context={window,localStorage,document:{readyState:'loading',addEventListener(){}}};
 vm.runInNewContext(readFileSync(new URL('../navigation.js',import.meta.url),'utf8'),context);
 const prefs=window.NSKMenuPreferences,key=prefs.cacheKey();
 values.set(key,JSON.stringify({shortcuts:['skills','anvandare','materialforvaltare'],revision:4}));
 assert.deepEqual(Array.from(prefs.readCache().shortcuts),['materialforvaltare','startsida','truppen']);
 identity={user:{id:'two'},permissions:['read']};assert.notEqual(prefs.cacheKey(),key);assert.deepEqual(Array.from(prefs.readCache().shortcuts),defaults);
 window.APP_CONFIG.AUTH_URL='https://other-auth.example';assert.notEqual(prefs.cacheKey(),key);
 assert.equal(prefs.choices().includes('skills'),false);assert.equal(prefs.choices().includes('skapapoolspel'),false);
});
