import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { guardRosterRoute } from './production-roster-route-guard.js';

const actor = { memberships: [{ team_id: 'team-18', role: 'team_admin' }], permissions: ['roster:manage'] };
const request = new Request('https://example.test/api/spelare/7', { method: 'PATCH', headers: { Authorization: 'Bearer valid-token' } });

test('authorizes a trusted persisted team and writes exactly once', async () => {
  let writes = 0;
  const result = await guardRosterRoute(request, {
    resolveTeamId: async () => 'team-18',
    verifyIdentity: async token => token === 'valid-token' ? actor : null,
    mutate: async () => { writes++; return { ok: true }; }
  });
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
});

test('rejects cross-team persisted row without writing', async () => {
  let writes = 0;
  const result = await guardRosterRoute(request, {
    resolveTeamId: async () => 'team-2',
    verifyIdentity: async () => actor,
    mutate: async () => { writes++; return { ok: true }; }
  });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});

test('rejects failed trusted team resolution without verifying or writing', async () => {
  let verified = 0;
  let writes = 0;
  const result = await guardRosterRoute(request, {
    resolveTeamId: async () => { throw Error('storage unavailable'); },
    verifyIdentity: async () => { verified++; return actor; },
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 502);
  assert.equal(verified, 0);
  assert.equal(writes, 0);
});

test('rejects incomplete security wiring', async () => {
  const result = await guardRosterRoute(request, { resolveTeamId: async () => 'team-18' });
  assert.equal(result.status, 500);
});

test('rejects missing bearer token after resolving team', async () => {
  let writes = 0;
  const result = await guardRosterRoute(new Request('https://example.test/api/spelare'), {
    resolveTeamId: async () => 'team-18',
    verifyIdentity: async () => actor,
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 401);
  assert.equal(writes, 0);
});
