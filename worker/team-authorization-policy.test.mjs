import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { authorizeTeamFeature, authorizeRosterMutation } from './team-authorization-policy.js';

const actor = { memberships: [{ team_id: 'team-18', role: 'team_admin' }], permissions: ['roster:manage'] };
test('only verified team member with explicit roster permission may write', () => {
  assert.equal(authorizeTeamFeature(actor, 'team-18', 'roster').allowed, true);
  assert.equal(authorizeTeamFeature(actor, 'team-2', 'roster').status, 403);
  assert.equal(authorizeTeamFeature({ ...actor, permissions: [] }, 'team-18', 'roster').status, 403);
  assert.equal(authorizeTeamFeature({ ...actor, memberships: [{ team_id: 'team-18', role: 'coach' }] }, 'team-18', 'roster').status, 200);
  assert.equal(authorizeTeamFeature(null, 'team-18', 'roster').status, 401);
  assert.equal(authorizeTeamFeature(actor, 'team-18', 'unknown').status, 400);
});
test('rejects missing token and never writes', async () => {
  let writes = 0;
  const result = await authorizeRosterMutation(new Request('https://example.test'), 'team-18', async () => actor, async () => { writes++; });
  assert.equal(result.status, 401);
  assert.equal(writes, 0);
});
test('rejects other team before mutation', async () => {
  let writes = 0;
  const request = new Request('https://example.test', { headers: { Authorization: 'Bearer valid-token' } });
  const result = await authorizeRosterMutation(request, 'team-2', async token => token === 'valid-token' ? actor : null, async () => { writes++; });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});
test('permits verified authorized write once', async () => {
  let writes = 0;
  const request = new Request('https://example.test', { headers: { Authorization: 'Bearer valid-token' } });
  const result = await authorizeRosterMutation(request, 'team-18', async () => actor, async () => { writes++; return { ok: true }; });
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
});

test('rejects invalid bearer token and failed identity lookup', async () => {
  let writes = 0;
  const invalid = new Request('https://example.test', { headers: { Authorization: 'Bearer invalid' } });
  const rejected = await authorizeRosterMutation(invalid, 'team-18', async () => null, async () => { writes++; });
  assert.equal(rejected.status, 401);
  const failed = await authorizeRosterMutation(invalid, 'team-18', async () => { throw Error('expired'); }, async () => { writes++; });
  assert.equal(failed.status, 401);
  assert.equal(writes, 0);
});
test('rejects missing team context before writing', async () => {
  let writes = 0;
  const request = new Request('https://example.test', { headers: { Authorization: 'Bearer valid-token' } });
  const result = await authorizeRosterMutation(request, '', async () => actor, async () => { writes++; });
  assert.equal(result.status, 400);
  assert.equal(writes, 0);
});

test('rejects malformed bearer header before identity verification', async () => {
  let verified = 0;
  let writes = 0;
  const headers = ['Bearer', 'Basic abc', 'Bearer token with spaces', 'Bearer  token'];
  for (const authorization of headers) {
    const request = new Request('https://example.test', { headers: { Authorization: authorization } });
    const result = await authorizeRosterMutation(request, 'team-18', async () => { verified++; return actor; }, async () => { writes++; });
    assert.equal(result.status, 401, authorization);
  }
  assert.equal(verified, 0);
  assert.equal(writes, 0);
});

test('global administrator still requires membership and explicit personal grant', () => {
  const globalAdmin = { ...actor, is_global_admin: true, memberships: [{ team_id: 'team-18', role: 'coach' }] };
  assert.equal(authorizeTeamFeature(globalAdmin, 'team-18', 'roster').allowed, true);
  assert.equal(authorizeTeamFeature(globalAdmin, 'team-2', 'roster').allowed, false);
  assert.equal(authorizeTeamFeature({ ...globalAdmin, permissions: [] }, 'team-18', 'roster').allowed, false);
  assert.equal(authorizeTeamFeature({ ...globalAdmin, is_global_admin: false }, 'team-18', 'roster').allowed, false);
  assert.equal(authorizeTeamFeature({ ...globalAdmin, memberships: [{ team_id: 'team-18', role: 'viewer' }] }, 'team-18', 'roster').allowed, false);
});

test('personal grant permits coach only in member team and only for granted feature', () => {
  const coach = { memberships: [{ team_id: 'team-18', role: 'coach' }], permissions: ['lineup:edit'] };
  assert.equal(authorizeTeamFeature(coach, 'team-18', 'lineup').allowed, true);
  assert.equal(authorizeTeamFeature(coach, 'team-18', 'roster').status, 403);
  assert.equal(authorizeTeamFeature(coach, 'team-2', 'lineup').status, 403);
});
