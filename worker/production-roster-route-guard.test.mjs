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

test('missing credentials do not trigger trusted team lookup', async () => {
  let lookups = 0;
  let writes = 0;
  const result = await guardRosterRoute(new Request('https://example.test/api/spelare'), {
    resolveTeamId: async () => { lookups++; return 'team-18'; },
    verifyIdentity: async () => actor,
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 401);
  assert.equal(lookups, 0);
  assert.equal(writes, 0);
});

test('rejects unsupported methods without team lookup or writes', async () => {
  let lookups = 0, writes = 0;
  const result = await guardRosterRoute(new Request('https://example.test/api/spelare', {
    method: 'GET', headers: { Authorization: 'Bearer valid-token' }
  }), {
    resolveTeamId: async () => { lookups++; return 'team-18'; },
    verifyIdentity: async () => actor,
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 405);
  assert.equal(lookups, 0);
  assert.equal(writes, 0);
});

test('fails closed when trusted team resolution returns an empty id', async () => {
  let verified = 0, writes = 0;
  const result = await guardRosterRoute(request, {
    resolveTeamId: async () => '',
    verifyIdentity: async () => { verified++; return actor; },
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 502);
  assert.equal(verified, 0);
  assert.equal(writes, 0);
});

test('denies a read-only member even for a trusted team', async () => {
  let writes = 0;
  const result = await guardRosterRoute(request, {
    resolveTeamId: async () => 'team-18',
    verifyIdentity: async () => ({
      memberships: [{ team_id: 'team-18', role: 'viewer' }],
      permissions: ['roster:manage']
    }),
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});

test('denies invalid personal token without writing', async () => {
  let writes = 0;
  const result = await guardRosterRoute(request, {
    resolveTeamId: async () => 'team-18',
    verifyIdentity: async () => null,
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 401);
  assert.equal(writes, 0);
});

test('permits DELETE only for an authorized team', async () => {
  let writes = 0;
  const deleteRequest = new Request('https://example.test/api/spelare/7', {
    method: 'DELETE', headers: { Authorization: 'Bearer valid-token' }
  });
  const result = await guardRosterRoute(deleteRequest, {
    resolveTeamId: async () => 'team-18',
    verifyIdentity: async () => actor,
    mutate: async () => { writes++; return { ok: true }; }
  });
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
});
