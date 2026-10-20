import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeCoachSelection } from './production-coach-selection-authorization.js';

const token='a'.repeat(43);
const teams=[{id:18,Namn:'NSK Team 18','Säsong':'2026'}];
const pool={id:12,Lag:[{id:18}],'Antal lag':2,'Antal matcher':3};
const actor=({membership=true,grants=['read','lineup:edit'],role='team_admin'}={})=>({
 user:{id:'u1'},
 memberships:membership?[{team_id:'NSK Team 18',role}]:[],
 permissions:grants
});
const req=(method,body={},bearer=token)=>{
 const url=new URL('https://nsk-api.example/api/coach-selection');
 if(method==='GET') for(const [k,v] of Object.entries({pool_id:12,lag_no:1,match_no:1,...body}))url.searchParams.set(k,v);
 return new Request(url,{method,headers:{...(bearer?{Authorization:'Bearer '+bearer}:{}),...(method==='POST'?{'Content-Type':'application/json'}:{})},
  ...(method==='POST'?{body:JSON.stringify({pool_id:12,lag_no:1,match_no:1,coach_ids:[],...body})}:{})});
};
const check=(request,{user=actor(),saved=pool,mapped=teams}={})=>authorizeCoachSelection(request,{AUTH_DB:{}},{
 verifyIdentity:async t=>t===token?user:null,
 readPool:async()=>saved,
 listTeams:async()=>mapped
});
test('personal read requires membership and read grant',async()=>{
 assert.equal((await check(req('GET'))).allowed,true);
 assert.equal((await check(req('GET'),{user:actor({membership:false})})).status,403);
 assert.equal((await check(req('GET'),{user:actor({grants:['lineup:edit']})})).status,403);
});
test('personal write requires lineup permission on the pool owner team',async()=>{
 assert.equal((await check(req('POST'))).allowed,true);
 assert.equal((await check(req('POST'),{user:actor({grants:['read']})})).status,403);
 assert.equal((await check(req('POST'),{user:actor({role:'viewer'})})).status,403);
 assert.equal((await check(req('POST'),{user:actor({membership:false})})).status,403);
});
test('invalid credentials and malformed references are denied',async()=>{
 assert.equal((await check(req('POST',{},null))).status,401);
 assert.equal((await check(req('GET',{pool_id:'garbage'}))).status,400);
 assert.equal((await check(req('POST',{lag_no:0}))).status,400);
 assert.equal((await check(req('GET',{lag_no:3}))).status,400);
});
test('trusted persisted ownership must be unique, existing, and Team 18',async()=>{
 assert.equal((await check(req('GET'),{saved:{...pool,Lag:[{id:18},{id:19}]}})).status,503);
 assert.equal((await check(req('GET'),{saved:null})).status,404);
 assert.equal((await check(req('POST'),{mapped:[{id:19,Namn:'NSK Testlag 2','Säsong':'2026'}]})).status,403);
});
