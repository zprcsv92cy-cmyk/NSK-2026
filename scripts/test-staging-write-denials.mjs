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


for(const memberships of [null,{},[null],[]]){
 const malformed={memberships,permissions:['lineup:edit']};
 const response=await stagingLineups(new Request('https://staging.invalid/api/auth/lineups-staging?team_id='+encodeURIComponent(team),{method:'POST'}),db,malformed,json);
 assert.equal(response.status,403,'Malformed lineup memberships must be rejected');
}
assert.equal(databaseCalls,0,'Malformed lineup requests must not reach the database');
console.log('PASS malformed lineup memberships rejected without database access');


for(const memberships of [null,{},[null],[]]){
 const malformed={memberships,permissions:['roster:manage']};
 const response=await stagingRoster(new Request('https://staging.invalid/api/auth/roster-staging?team_id='+encodeURIComponent(team),{method:'POST'}),db,malformed,json);
 assert.equal(response.status,403,'Malformed roster memberships must be rejected');
}
assert.equal(databaseCalls,0,'Malformed roster requests must not reach the database');
console.log('PASS malformed roster memberships rejected without database access');


const lineupAdmin={user:{id:uuid},memberships:[{team_id:team,role:'team_admin'}],permissions:['lineup:edit']};
const lineupUrl='https://staging.invalid/api/auth/lineups-staging?team_id='+encodeURIComponent(team);
for(const [name,payload] of [
 ['empty match name',{match_name:'',player_ids:[],coach_ids:[]}],
 ['invalid date',{match_name:'Test',match_date:'2026-99-99-xx',player_ids:[],coach_ids:[]}],
 ['duplicate players',{match_name:'Test',player_ids:[uuid,uuid],coach_ids:[]}],
 ['goalie also outfield',{match_name:'Test',player_ids:[uuid],coach_ids:[],goalie_id:uuid}],
 ['invalid position',{match_name:'Test',player_ids:[],coach_ids:[],positions:{[uuid]:'forward'}}],
 ['invalid unit',{match_name:'Test',player_ids:[],coach_ids:[],units:{[uuid]:'line1'}}],
 ['too many players',{match_name:'Test',player_ids:Array.from({length:101},(_,i)=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0')),coach_ids:[]}]
]){
 const response=await stagingLineups(new Request(lineupUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),db,lineupAdmin,json);
 assert.equal(response.status,400,name+' must be rejected before SQL');
}
assert.equal(databaseCalls,0,'Invalid lineup payloads must not reach the database');
console.log('PASS invalid lineup payloads rejected before SQL');
