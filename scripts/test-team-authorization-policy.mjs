import assert from 'node:assert/strict';
import {authorizeTeamFeature,FEATURE_PERMISSIONS} from '../worker/team-authorization-policy.js';
const team='NSK Team 18';
const actor=(role,permissions,teamId=team)=>({memberships:[{team_id:teamId,role}],permissions});
for(const feature of Object.keys(FEATURE_PERMISSIONS)){
 const permission=FEATURE_PERMISSIONS[feature];
 assert.equal(authorizeTeamFeature(null,team,feature).status,401);
 assert.equal(authorizeTeamFeature(actor('team_admin',[permission]),'Annat lag',feature).status,403);
 assert.equal(authorizeTeamFeature(actor('viewer',[permission]),team,feature).status,403);
 assert.equal(authorizeTeamFeature(actor('player',[permission]),team,feature).status,403);
 assert.equal(authorizeTeamFeature(actor('coach',[permission]),team,feature).status,403);
 assert.equal(authorizeTeamFeature(actor('team_manager',[permission]),team,feature).status,403);
 assert.equal(authorizeTeamFeature(actor('team_admin',[]),team,feature).status,403);
 assert.equal(authorizeTeamFeature(actor('team_admin',[permission]),team,feature).allowed,true);
}
assert.equal(authorizeTeamFeature(actor('team_admin',[]),team,'unknown').status,400);
assert.equal(authorizeTeamFeature(actor('team_admin',[]),'','roster').status,400);
console.log('PASS server authorization policy for all feature permissions and cross-team denials');
// Multi-team regression: a grant cannot borrow administrator status from another team.
const multiTeam={
 memberships:[{team_id:'NSK Team 18',role:'team_admin'},{team_id:'NSK Testlag 2',role:'viewer'}],
 permissions:['roster:manage','match:manage']
};
for(const feature of ['roster','matches']){
 assert.equal(authorizeTeamFeature(multiTeam,'NSK Team 18',feature).allowed,true);
 assert.equal(authorizeTeamFeature(multiTeam,'NSK Testlag 2',feature).status,403);
 assert.equal(authorizeTeamFeature(multiTeam,'Unknown Team',feature).status,403);
}
const promoted={...multiTeam,memberships:[{team_id:'NSK Team 18',role:'viewer'},{team_id:'NSK Testlag 2',role:'team_admin'}]};
assert.equal(authorizeTeamFeature(promoted,'NSK Team 18','matches').status,403);
assert.equal(authorizeTeamFeature(promoted,'NSK Testlag 2','matches').allowed,true);
console.log('PASS multi-team role isolation with shared personal grants');
for(const invalid of [null,undefined,'',42,{},'x'.repeat(101)]){
 assert.equal(authorizeTeamFeature(actor('team_admin',['roster:manage']),invalid,'roster').status,400,'Invalid team ID must fail closed');
}
for(const feature of [null,undefined,'',{},'unknown']){
 assert.equal(authorizeTeamFeature(actor('team_admin',['roster:manage']),team,feature).status,400,'Invalid feature must fail closed');
}
for(const malformed of [
 {memberships:[],permissions:['roster:manage']},
 {memberships:[{team_id:team,role:'viewer'}],permissions:['roster:manage']},
 {memberships:[{team_id:team,role:'team_admin'}],permissions:[]}
]){
 assert.equal(authorizeTeamFeature(malformed,team,'roster').allowed,false,'Incomplete actor must not gain write access');
}
console.log('PASS invalid team and feature inputs are denied');

// Malformed identity collections must deny access without throwing or returning 500.
for(const malformed of [
 {memberships:{team_id:team,role:'team_admin'},permissions:['roster:manage']},
 {memberships:[null,{team_id:team,role:'viewer'}],permissions:['roster:manage']},
 {memberships:[{team_id:team,role:'team_admin'}],permissions:'roster:manage'},
 {memberships:[{team_id:team,role:'team_admin'}],permissions:{includes:()=>true}},
 {memberships:null,permissions:['roster:manage']}
]){
 const decision=authorizeTeamFeature(malformed,team,'roster');
 assert.equal(decision.allowed,false,'Malformed actor collections must fail closed');
 assert.equal(decision.status,403);
}
console.log('PASS malformed actor collections fail closed');

const allRoles=['team_admin','coach','team_manager','fitness','equipment','player','viewer'];
for(const role of allRoles){
 const subject={memberships:[{team_id:'NSK Team 18',role},{team_id:'NSK Testlag 2',role:'viewer'}],permissions:Object.values(FEATURE_PERMISSIONS)};
 for(const feature of Object.keys(FEATURE_PERMISSIONS)){
  assert.equal(authorizeTeamFeature(subject,'NSK Team 18',feature).allowed,role==='team_admin');
  assert.equal(authorizeTeamFeature(subject,'NSK Testlag 2',feature).allowed,false);
 }
}
const switchedTeams={memberships:[{team_id:'NSK Team 18',role:'viewer'},{team_id:'NSK Testlag 2',role:'team_admin'}],permissions:Object.values(FEATURE_PERMISSIONS)};
for(const feature of Object.keys(FEATURE_PERMISSIONS)){
 assert.equal(authorizeTeamFeature(switchedTeams,'NSK Team 18',feature).allowed,false);
 assert.equal(authorizeTeamFeature(switchedTeams,'NSK Testlag 2',feature).allowed,true);
}
console.log('PASS role matrix and team switching for every protected feature');






// Regression: both staging roster controls must include the selected team.
import {readFileSync} from 'node:fs';
const rosterPage=readFileSync(new URL('../worker/roster-access-page.js',import.meta.url),'utf8');
for(const endpoint of ['feature-access?feature=roster&team_id=','roster-write-check?team_id=']){
 assert.ok(rosterPage.includes(endpoint+"'+encodeURIComponent($('team').value)"),'Roster UI must send selected team to '+endpoint);
}
assert.ok(!rosterPage.includes("fetch('/api/auth/roster-write-check',{method:"),'Roster UI must not use unscoped write checks');
console.log('PASS roster UI sends selected team to both authorization checks');

const authModule=readFileSync(new URL('../worker/team-auth.js',import.meta.url),'utf8');
assert.ok(authModule.includes('authorizeTeamFeature(actor, teamId, feature).allowed ? actor : null'),'Team helper must enforce team-scoped policy');
assert.ok(!authModule.includes('return requirePersonPermission(request, env, permission);'),'Team helper must not use global grant alone');
console.log('PASS team permission helper cannot bypass team membership');
