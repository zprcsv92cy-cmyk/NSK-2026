import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('parallel roster reads share team request and refresh again after completion',async()=>{
 const requests=[];const sandbox={window:{APP_CONFIG:{API_URL:'https://api.invalid',REQUIRE_SCOPED_ROSTER_READS:true},Auth:{getToken:()=> 'a'.repeat(43)}},URL,console,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({ok:true,results:url.includes('/lag?')?[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]:[],next:null})};}};
 vm.runInNewContext(readFileSync(new URL('../db.js',import.meta.url),'utf8'),sandbox);
 await Promise.all([sandbox.window.DB.listPlayers(),sandbox.window.DB.listCoaches(),sandbox.window.DB.listPlayers()]);
 assert.equal(requests.filter(u=>u.includes('/lag?')).length,1);
 assert.equal(requests.filter(u=>u.includes('/spelare?')).length,1);
 await sandbox.window.DB.listPlayers();
 assert.equal(requests.filter(u=>u.includes('/lag?')).length,2);
 assert.equal(requests.filter(u=>u.includes('/spelare?')).length,2);
});
test('failed reads are evicted and can recover on next attempt',async()=>{
 let calls=0;const sandbox={window:{APP_CONFIG:{},Auth:{}},URL,console,fetch:async()=>{if(++calls===1)throw Error('offline');return {ok:true,json:async()=>({ok:true,results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]})};}};
 vm.runInNewContext(readFileSync(new URL('../db.js',import.meta.url),'utf8'),sandbox);
 await assert.rejects(sandbox.window.DB.listPlayers(),/offline/);
 await sandbox.window.DB.listPlayers();assert.equal(calls,3);
});
test('concurrent authentication checks share a request without caching future permission checks',async()=>{
 const values=new Map([['nsk_user_token','a'.repeat(43)]]);const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let calls=0;const sandbox={window:{APP_CONFIG:{AUTH_URL:'https://auth.invalid'}},sessionStorage:storage,localStorage:storage,fetch:async()=>{calls++;return {ok:true,json:async()=>({user:{id:'u'},memberships:[{team_id:'NSK Team 18'}],permissions:['read']})};}};
 vm.runInNewContext(readFileSync(new URL('../auth.js',import.meta.url),'utf8'),sandbox);
 await Promise.all([sandbox.window.Auth.init(),sandbox.window.Auth.init(),sandbox.window.Auth.init()]);assert.equal(calls,1);
 await sandbox.window.Auth.init();assert.equal(calls,2);
});
test('all staff roles share one authorized read and a later reload is fresh',async()=>{
 const requests=[];const sandbox={window:{APP_CONFIG:{API_URL:'https://api.invalid',REQUIRE_SCOPED_ROSTER_READS:true},Auth:{getToken:()=> 'a'.repeat(43)}},URL,console,fetch:async url=>{requests.push(url);return {ok:true,json:async()=>({ok:true,results:url.includes('/lag?')?[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]:[{id:'e',name:'Material',role:'equipment'},{id:'l',name:'Ledare',role:'leader'}],next:null})};}};
 vm.runInNewContext(readFileSync(new URL('../db.js',import.meta.url),'utf8'),sandbox);
 const result=await Promise.all(['leader','fitness','equipment'].map(role=>sandbox.window.DB.listStaff(role)));
 assert.equal(requests.filter(u=>u.includes('/lagpersonal?')).length,1);
 assert.equal(result[0][0].full_name,'Ledare');assert.equal(result[1].length,0);assert.equal(result[2][0].full_name,'Material');
 await sandbox.window.DB.listStaff('equipment');assert.equal(requests.filter(u=>u.includes('/lagpersonal?')).length,2);
});
