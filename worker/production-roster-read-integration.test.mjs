import assert from 'node:assert/strict';
import { readPersonallyAuthorizedLegacyRoster as read } from './production-roster-read-integration.js';

const request = path => new Request('https://nsk-api.invalid' + path, {
  headers: { Authorization: 'Bearer ' + 'x'.repeat(43) }
});
const admin = {user:{id:'user-admin'},memberships:[{team_id:'NSK Team 18',role:'team_admin'}],permissions:['read','roster:manage']};
const viewer = {user:{id:'user-viewer'},memberships:[{team_id:'NSK Testlag 2',role:'viewer'}],permissions:['read']};
const teams = [
  {id:18,Namn:'NSK Team 18','Säsong':'2026'},
  {id:27,Namn:'NSK Testlag 2','Säsong':'2026'}
];
let reads = 0;
async function check(actor, path, expected, owner = '18') {
  const response = await read(request(path), {
    verifyPersonalSession: async () => actor,
    listTrustedTeams: async () => teams,
    resolveOwnerTeam: async () => owner,
    readTeamData: async (req, id, identity) => {
      reads++;
      assert.equal(id, owner);
      assert.ok(identity.memberships.some(x => x.team_id === id));
      return Response.json({ok:true,results:[]});
    }
  });
  assert.equal(response.status, expected, path + ': ' + await response.text());
  assert.equal(response.headers.get('cache-control'), 'no-store');
}
await check(admin, '/api/spelare?team_id=18', 200);
await check(admin, '/api/tranare?team_id=27', 403, '27');
await check(viewer, '/api/spelare?team_id=27', 200, '27');
await check(viewer, '/api/spelare?team_id=18', 403);
await check(null, '/api/spelare?team_id=18', 401);
assert.equal(reads, 2, 'Only own-team reads may reach the data source');
const unavailable = await read(request('/api/spelare?team_id=18'), {
  verifyPersonalSession: async () => admin,
  listTrustedTeams: async () => { throw Error('Baserow unavailable'); },
  resolveOwnerTeam: async () => '18',
  readTeamData: async () => { throw Error('This must not be reached'); }
});
assert.equal(unavailable.status, 503, 'Untrusted mapping must fail closed');
// The production adapter must pass a bearer token to the existing AUTH_DB verifier.
// Missing AUTH_DB must fail closed and never call the trusted roster data source.
const { createProductionRosterReadHandler } = await import('./production-roster-read-integration.js');
let untrustedReads = 0;
const productionRead = createProductionRosterReadHandler({}, {
  listTrustedTeams: async () => teams,
  resolveOwnerTeam: async () => '18',
  readTeamData: async () => { untrustedReads++; return Response.json({ok:true}); }
});
const rejected = await productionRead(request('/api/spelare?team_id=18'));
assert.equal(rejected.status, 401, 'Missing AUTH_DB must deny personal roster access');
assert.equal(untrustedReads, 0, 'Missing session must never access roster data');

console.log('PASS personal identity to trusted legacy team read integration (isolated)');
