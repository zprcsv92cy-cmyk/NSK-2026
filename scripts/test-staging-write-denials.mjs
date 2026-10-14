import assert from 'node:assert/strict';
import { stagingRoster } from '../worker/staging-roster.js';
import { stagingLineups } from '../worker/staging-lineups.js';

const team='NSK Team 18';
const actor={memberships:[{team_id:team,role:'viewer'}],permissions:['read']};
let databaseCalls=0;
const db={prepare(){databaseCalls++;throw Error('Database must not be touched by denied write');}};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
const uuid='00000000-0000-4000-8000-000000000000';
const cases=[
 ['trupp: skapa',stagingRoster,'POST','/api/auth/roster-staging'],
 ['trupp: ändra',stagingRoster,'PATCH','/api/auth/roster-staging/'+uuid],
 ['trupp: ta bort',stagingRoster,'DELETE','/api/auth/roster-staging/'+uuid],
 ['laguppställning: skapa',stagingLineups,'POST','/api/auth/lineups-staging'],
 ['laguppställning: ändra',stagingLineups,'PATCH','/api/auth/lineups-staging'],
 ['laguppställning: ta bort',stagingLineups,'DELETE','/api/auth/lineups-staging']
];
for(const [name,handler,method,path] of cases){
 const url='https://staging.invalid'+path+'?team_id='+encodeURIComponent(team)+'&id='+uuid;
 const response=await handler(new Request(url,{method}),db,actor,json);
 assert.equal(response.status,403,name+' should return 403');
 console.log('PASS',name,'403');
}
assert.equal(databaseCalls,0,'Denied writes must not reach the database');
for(const [name,handler,method,path] of cases){
 const response=await handler(new Request('https://staging.invalid'+path+'?team_id=Annat+lag&id='+uuid,{method}),db,actor,json);
 assert.equal(response.status,403,name+' must deny another team');
}
console.log('PASS cross-team denials, no database operations');
