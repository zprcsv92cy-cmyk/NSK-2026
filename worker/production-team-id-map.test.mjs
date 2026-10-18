import assert from 'node:assert/strict';
import { mapTrustedMembershipsToLegacyTeams as map } from './production-team-id-map.js';
const teams = [{ id: 18, Namn: 'NSK Team 18', 'Säsong': 2026 },
  { id: 27, Namn: 'NSK Testlag 2', 'Säsong': '2026' }];
const actor = {user:{id:'test'},memberships:[
  {team_id:'NSK Team 18',role:'team_admin'},
  {team_id:'NSK Testlag 2',role:'viewer'}
],permissions:['roster:manage']};
const mapped = map(actor, teams);
assert.deepEqual(mapped.memberships, [
  {team_id:'18',role:'team_admin'}, {team_id:'27',role:'viewer'}]);
assert.notEqual(mapped.permissions,actor.permissions);
assert.throws(()=>map(actor, [...teams, {...teams[0],id:22}]), /ambiguous/);
assert.throws(()=>map(actor, [teams[0]]), /missing/);
assert.throws(()=>map(actor, [{...teams[0],id:0},teams[1]]), /missing/);
assert.throws(()=>map({...actor,memberships:[{team_id:'18',role:'team_admin'}]}, teams), /missing/);
assert.throws(()=>map({...actor,memberships:[{team_id:'NSK Team 18',role:'team_admin'}, {team_id:'NSK Team 18',role:'viewer'}]},teams), /Duplicate/);
assert.throws(()=>map(null, teams), /required/);
assert.throws(()=>map({...actor,memberships:[]}, null), /required/);
console.log('PASS trusted legacy team ID mapping; ambiguous/missing teams denied');

const globalOwner={user:{id:'root'},memberships:[{team_id:'*',role:'owner'}],permissions:['roster:manage','users:manage']};
assert.deepEqual(map(globalOwner,teams).memberships,[
 {team_id:'18',role:'owner'},{team_id:'27',role:'owner'}]);
assert.throws(()=>map({...globalOwner,memberships:[{team_id:'*',role:'viewer'}]},teams),/Invalid global/);
assert.throws(()=>map(globalOwner,[...teams,{...teams[0],id:55}]),/Ambiguous global/);

// Only the server-verified global admin flag grants all-team read access.
const verifiedAdmin={user:{id:'root'},is_global_admin:true,memberships:[],permissions:[]};
const adminMapped=map(verifiedAdmin,teams);
assert.deepEqual(adminMapped.memberships,[{team_id:'18',role:'owner'},{team_id:'27',role:'owner'}]);
assert.ok(adminMapped.permissions.includes('read'));
assert.deepEqual(map({...verifiedAdmin,is_global_admin:false},teams).memberships,[]);
assert.ok(!map({...verifiedAdmin,is_global_admin:false},teams).permissions.includes('read'));
