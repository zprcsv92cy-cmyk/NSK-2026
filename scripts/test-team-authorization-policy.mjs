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
