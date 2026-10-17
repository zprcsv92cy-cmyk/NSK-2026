import assert from 'node:assert/strict';
import {legacyRosterAdapter} from '../worker/staging-legacy-roster-adapter.js';
const team='NSK Team 18';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
const row={id:'test-1',kind:'player',name:'Testspelare'};
let calls=0;
const db={prepare(sql){calls++;assert.match(sql,/WHERE team_id=\?/);return {bind(value){assert.equal(value,team);return {all:async()=>({results:[row]})}}}}};
const url='https://staging.invalid/api/auth/integration/roster?team_id='+encodeURIComponent(team);
let response=await legacyRosterAdapter(new Request(url),db,null,json);
assert.equal(response.status,401);
response=await legacyRosterAdapter(new Request(url),db,{memberships:[],permissions:['roster:manage']},json);
assert.equal(response.status,403);
assert.equal(calls,0);
response=await legacyRosterAdapter(new Request(url,{method:'POST'}),db,{memberships:[{team_id:team,role:'team_admin'}],permissions:['roster:manage']},json);
assert.equal(response.status,405);
assert.equal(calls,0);
for(const [role,permission,expected] of [
 ['viewer','roster:manage',false],
 ['coach','roster:manage',false],
 ['team_admin','read',false],
 ['team_admin','roster:manage',true]
]){
 response=await legacyRosterAdapter(new Request(url),db,{memberships:[{team_id:team,role}],permissions:[permission]},json);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.equal(body.canManage,expected,role);
 assert.equal(body.players.length,1);
}
console.log('PASS staging legacy roster adapter team isolation, read-only and roles');
