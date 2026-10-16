import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { verifyStagingSession } from './staging-session-identity.js';

const token = 'a'.repeat(32);
function database(user) {
  const calls = [];
  return { calls, prepare(sql) {
    const entry = { sql, args: [] };
    calls.push(entry);
    return { bind(...args) {
      entry.args = args;
      return {
        first: async () => user,
        all: async () => ({ results: sql.includes('auth_team_memberships')
          ? [{ team_id: 'team-18', role: 'team_admin' }]
          : [{ permission: 'roster:manage' }] })
      };
    } };
  } };
}
test('rejects malformed session before database access', async () => {
  const db = database({ id: 'u1' });
  assert.equal(await verifyStagingSession('short', { AUTH_DB: db }), null);
  assert.equal(db.calls.length, 0);
});
test('rejects revoked or expired session when database returns no user', async () => {
  const db = database(null);
  assert.equal(await verifyStagingSession(token, { AUTH_DB: db }), null);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /revoked_at IS NULL/);
  assert.match(db.calls[0].sql, /expires_at > datetime/);
});
test('returns server-owned membership and permission grants', async () => {
  const db = database({ id: 'u1', display_name: 'Test' });
  const actor = await verifyStagingSession(token, { AUTH_DB: db });
  assert.deepEqual(actor.memberships, [{ team_id: 'team-18', role: 'team_admin' }]);
  assert.deepEqual(actor.permissions, ['roster:manage']);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].args[0], /^[0-9a-f]{64}$/);
  assert.deepEqual(db.calls[1].args, ['u1']);
  assert.deepEqual(db.calls[2].args, ['u1']);
});


test('session identity does not accept roles from caller-provided data', async () => {
  const db = database({ id: 'u1', display_name: 'Test' });
  const actor = await verifyStagingSession(token, {
    AUTH_DB: db,
    memberships: [{ team_id: 'NSK Testlag 2', role: 'team_admin' }],
    permissions: ['users:manage']
  });
  assert.deepEqual(actor.memberships, [{ team_id: 'team-18', role: 'team_admin' }]);
  assert.deepEqual(actor.permissions, ['roster:manage']);
});
test('session identity fails closed if permissions query fails', async () => {
  let calls = 0;
  const db = { prepare() {
    calls++;
    if (calls === 3) throw Error('database unavailable');
    return { bind() { return {
      first: async () => ({ id: 'u1', display_name: 'Test' }),
      all: async () => ({ results: [{ team_id: 'team-18', role: 'team_admin' }] })
    }; } };
  } };
  await assert.rejects(() => verifyStagingSession(token, { AUTH_DB: db }));
});
