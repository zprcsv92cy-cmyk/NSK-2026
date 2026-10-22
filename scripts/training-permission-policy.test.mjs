import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeTeamFeature} from '../worker/team-authorization-policy.js';
const actor={memberships:[{team_id:'18',role:'coach'}],permissions:['read','lineup:edit']};
test('training edits require membership and lineup role',()=>{
 assert.equal(authorizeTeamFeature(actor,'18','lineup').allowed,true);
 assert.equal(authorizeTeamFeature(actor,'19','lineup').allowed,false);
 assert.equal(authorizeTeamFeature({...actor,memberships:[{team_id:'18',role:'viewer'}]},'18','lineup').allowed,false);
 assert.equal(authorizeTeamFeature({...actor,permissions:['read']},'18','lineup').allowed,false);
});
