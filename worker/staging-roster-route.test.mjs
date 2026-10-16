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
  assert.equal((await handleStagingRosterRoute(req, env)).status, 503);
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
