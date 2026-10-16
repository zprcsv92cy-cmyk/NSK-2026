import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { authorizeTeamFeature, authorizeRosterMutation } from './team-authorization-policy.js';

const actor = { memberships: [{ team_id: 'team-18', role: 'team_admin' }], permissions: ['roster:manage'] };
test('only team admin with explicit roster permission may write', () => {
  assert.equal(authorizeTeamFeature(actor, 'team-18', 'roster').allowed, true);
  assert.equal(authorizeTeamFeature(actor, 'team-2', 'roster').status, 403);
  assert.equal(authorizeTeamFeature({ ...actor, permissions: [] }, 'team-18', 'roster').status, 403);
  assert.equal(authorizeTeamFeature({ ...actor, memberships: [{ team_id: 'team-18', role: 'coach' }] }, 'team-18', 'roster').status, 403);
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
