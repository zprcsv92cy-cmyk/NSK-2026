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


test('training write permission is denied without team membership even to global admins',()=>{
 const admin={memberships:[{team_id:'18',role:'team_admin'}],permissions:['read','lineup:edit'],is_global_admin:true};
 assert.equal(authorizeTeamFeature(admin,'19','lineup').status,403);
});

test('training write permission needs explicit personal lineup grant even for owners',()=>{
 const owner={memberships:[{team_id:'18',role:'owner'}],permissions:['read']};
 assert.equal(authorizeTeamFeature(owner,'18','lineup').allowed,false);
});

test('training write permission rejects unrelated permission and unknown feature',()=>{
 const wrong={memberships:[{team_id:'18',role:'coach'}],permissions:['read','pool:create']};
 assert.equal(authorizeTeamFeature(wrong,'18','lineup').allowed,false);
 assert.equal(authorizeTeamFeature(wrong,'18','training').status,400);
});
