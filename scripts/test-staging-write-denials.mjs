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

for(const role of ['viewer','player','coach','team_manager','fitness','equipment']){
 const elevated={memberships:[{team_id:team,role}],permissions:['roster:manage','lineup:edit']};
 for(const [name,handler,method,path] of cases){
  const response=await handler(new Request('https://staging.invalid'+path+'?team_id='+encodeURIComponent(team)+'&id='+uuid,{method}),db,elevated,json);
  assert.equal(response.status,403,role+' with global grant must not write: '+name);
 }
}
for(const [name,handler,method,path] of cases){
 const response=await handler(new Request('https://staging.invalid'+path+'?team_id='+encodeURIComponent(team)+'&id='+uuid,{method}),db,null,json);
 assert.equal(response.status,401,'Unauthenticated: '+name);
}
assert.equal(databaseCalls,0,'No denied writes may access the database');
console.log('PASS role escalation and unauthenticated write denials');

// Read access must also reject unauthenticated and cross-team requests before SQL.
for(const [name,handler,path] of [
 ['trupp',stagingRoster,'/api/auth/roster-staging'],
 ['laguppställning',stagingLineups,'/api/auth/lineups-staging']
]){
 const ownUrl='https://staging.invalid'+path+'?team_id='+encodeURIComponent(team);
 const otherUrl='https://staging.invalid'+path+'?team_id='+encodeURIComponent('Annat lag');
 assert.equal((await handler(new Request(ownUrl),db,null,json)).status,401,name+' read requires login');
 assert.equal((await handler(new Request(otherUrl),db,actor,json)).status,403,name+' read must reject another team');
 assert.equal((await handler(new Request('https://staging.invalid'+path),db,actor,json)).status,400,name+' read requires team');
}
assert.equal(databaseCalls,0,'Denied reads must not touch the database');
console.log('PASS unauthenticated and cross-team read denials before SQL');
