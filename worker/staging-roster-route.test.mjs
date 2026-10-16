import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { handleStagingRosterRoute } from './staging-roster-route.js';

const url = 'https://example.test/api/auth/roster-staging?team_id=team-18';
const token = 'a'.repeat(32);
const actor = { memberships: [{ team_id: 'team-18', role: 'team_admin' }], permissions: ['roster:manage'] };
const env = { AUTH_DB: { prepare() { return { bind() { return { all: async () => ({ results: [] }) }; } }; } } };

test('rejects missing bearer token before identity lookup', async () => {
  let called = 0;
  const response = await handleStagingRosterRoute(new Request(url), env, async () => { called++; return actor; });
  assert.equal(response.status, 401);
  assert.equal(called, 0);
});

test('rejects unverified personal identity', async () => {
  const response = await handleStagingRosterRoute(new Request(url, { headers: { Authorization: 'Bearer ' + token } }), env, async () => null);
  assert.equal(response.status, 401);
});

test('allows server-verified member to read staging roster', async () => {
  const response = await handleStagingRosterRoute(new Request(url, { headers: { Authorization: 'Bearer ' + token } }), env, async supplied => {
    assert.equal(supplied, token);
    return actor;
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.canManage, true);
});

test('fails closed when identity verifier or database is unavailable', async () => {
  const req = new Request(url, { headers: { Authorization: 'Bearer ' + token } });
  assert.equal((await handleStagingRosterRoute(req, {}, async () => actor)).status, 503);
  // A missing session in a configured D1 store is an authentication failure.
  assert.equal((await handleStagingRosterRoute(req, env)).status, 401);
});

test('cross-team staging reads are rejected after identity verification', async () => {
  let queries = 0;
  const db = { prepare() { queries++; throw Error('should not query'); } };
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-2', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const response = await handleStagingRosterRoute(req, { AUTH_DB: db }, async () => actor);
  assert.equal(response.status, 403);
  assert.equal(queries, 0);
});

test('failed identity verification never queries staging database', async () => {
  let queries = 0;
  const db = { prepare() { queries++; throw Error('should not query'); } };
  const req = new Request(url, { headers: { Authorization: 'Bearer ' + token } });
  const response = await handleStagingRosterRoute(req, { AUTH_DB: db }, async () => { throw Error('expired'); });
  assert.equal(response.status, 401);
  assert.equal(queries, 0);
});

test('default identity verifier rejects unknown session before roster query', async () => {
  const queries = [];
  const db = { prepare(sql) {
    queries.push(sql);
    return { bind() { return { first: async () => null }; } };
  } };
  const req = new Request(url, { headers: { Authorization: 'Bearer ' + token } });
  const response = await handleStagingRosterRoute(req, { AUTH_DB: db });
  assert.equal(response.status, 401);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /auth_sessions/);
  assert.doesNotMatch(queries[0], /auth_roster_staging/);
});

test('default D1 identity verifier authorizes member and scopes roster query', async () => {
  const sqlCalls = [];
  const db = { prepare(sql) {
    const entry = { sql, args: [] }; sqlCalls.push(entry);
    return { bind(...args) {
      entry.args = args;
      return {
        first: async () => ({ id: 'user-1', display_name: 'Test' }),
        all: async () => ({ results: sql.includes('auth_team_memberships')
          ? [{ team_id: 'team-18', role: 'team_admin' }]
          : sql.includes('auth_user_permissions')
            ? [{ permission: 'roster:manage' }]
            : [{ id: 'row-1', kind: 'player', name: 'Test' }] })
      };
    } };
  } };
  const req = new Request(url, { headers: { Authorization: 'Bearer ' + token } });
  const response = await handleStagingRosterRoute(req, { AUTH_DB: db });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).canManage, true);
  assert.equal(sqlCalls.length, 4);
  assert.deepEqual(sqlCalls[1].args, ['user-1']);
  assert.deepEqual(sqlCalls[2].args, ['user-1']);
  assert.deepEqual(sqlCalls[3].args, ['team-18']);
});


test('verified Team 18 session can write own roster but not Testlag 2', async () => {
  const writes = [];
  const db = { prepare(sql) {
    return { bind(...args) {
      return { run: async () => { writes.push({ sql, args }); return { meta: { changes: 1 } }; } };
    } };
  } };
  const actor = {
    memberships: [{ team_id: 'NSK Team 18', role: 'team_admin' }],
    permissions: ['roster:manage']
  };
  const send = team => new Request(
    'https://example.test/api/auth/roster-staging?team_id=' + encodeURIComponent(team),
    { method: 'POST', headers: { Authorization: 'Bearer ' + token },
      body: JSON.stringify({ kind: 'player', name: 'TEST' }) }
  );
  const verify = async supplied => {
    assert.equal(supplied, token);
    return actor;
  };
  const own = await handleStagingRosterRoute(send('NSK Team 18'), { AUTH_DB: db }, verify);
  assert.equal(own.status, 201);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args[1], 'NSK Team 18');
  const other = await handleStagingRosterRoute(send('NSK Testlag 2'), { AUTH_DB: db }, verify);
  assert.equal(other.status, 403);
  assert.equal(writes.length, 1);
});

test('PATCH only targets rows belonging to the authorized team', async () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  const writes = [];
  const db = { prepare(sql) { return { bind(...args) { return {
    run: async () => { writes.push({ sql, args }); return { meta: { changes: 0 } }; }
  }; } }; } };
  const request = new Request('https://example.test/api/auth/roster-staging/' + id + '?team_id=team-18', {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'TEST' })
  });
  const response = await handleStagingRosterRoute(request, { AUTH_DB: db }, async () => actor);
  assert.equal(response.status, 404);
  assert.equal(writes.length, 1);
  assert.ok(writes[0].sql.includes('WHERE id=? AND team_id=?'));
  assert.deepEqual(writes[0].args.slice(-2), [id, 'team-18']);
});

test('legacy API binding is never called when staging D1 is missing', async () => {
  let legacyCalls = 0;
  const request = new Request(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token },
    body: JSON.stringify({ kind: 'player', name: 'TEST' }) });
  const response = await handleStagingRosterRoute(request, {
    LEGACY_API: { fetch: async () => { legacyCalls++; throw Error('Unexpected legacy API call'); } }
  }, async () => actor);
  assert.equal(response.status, 503);
  assert.equal(legacyCalls, 0);
});

test('verified Testlag 2 viewer is denied all roster mutations despite global grant', async () => {
  let storageCalls = 0;
  const db = { prepare() { storageCalls++; throw Error('viewer must not access storage for writes'); } };
  const viewer = {
    memberships: [{ team_id: 'NSK Testlag 2', role: 'viewer' }],
    permissions: ['roster:manage']
  };
  const id = '123e4567-e89b-42d3-a456-426614174000';
  for (const [method, path, body] of [
    ['POST', '/api/auth/roster-staging', { kind: 'player', name: 'DENIED' }],
    ['PATCH', '/api/auth/roster-staging/' + id, { name: 'DENIED' }],
    ['DELETE', '/api/auth/roster-staging/' + id, null]
  ]) {
    const req = new Request('https://example.test' + path + '?team_id=NSK%20Testlag%202', {
      method, headers: { Authorization: 'Bearer ' + token },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const response = await handleStagingRosterRoute(req, { AUTH_DB: db }, async supplied => {
      assert.equal(supplied, token);
      return viewer;
    });
    assert.equal(response.status, 403, method);
    assert.equal(storageCalls, 0, method);
  }
});

test('multi-team admin may edit Team 18 but not viewer-only Testlag 2', async () => {
  const writes = [];
  const db = { prepare(sql) { return { bind(...args) { return {
    run: async () => { writes.push({ sql, args }); return { meta: { changes: 1 } }; }
  }; } }; } };
  const multiTeamActor = {
    memberships: [
      { team_id: 'NSK Team 18', role: 'team_admin' },
      { team_id: 'NSK Testlag 2', role: 'viewer' }
    ],
    permissions: ['roster:manage']
  };
  for (const [team, expected] of [['NSK Team 18', 201], ['NSK Testlag 2', 403]]) {
    const request = new Request(
      'https://example.test/api/auth/roster-staging?team_id=' + encodeURIComponent(team),
      { method: 'POST', headers: { Authorization: 'Bearer ' + token },
        body: JSON.stringify({ kind: 'player', name: 'ROLE TEST' }) }
    );
    const response = await handleStagingRosterRoute(request, { AUTH_DB: db }, async () => multiTeamActor);
    assert.equal(response.status, expected, team);
  }
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args[1], 'NSK Team 18');
});
