import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { guardLagpersonalMutation, resolveLagpersonalTeam } from './production-lagpersonal-auth-guard.js';

const token = 'A'.repeat(40);
const hash = createHash('sha256').update(token).digest('hex');
function db({ disabled = false, membership = '18', role = 'team_admin', permission = 'roster:manage', globalAdmin = false } = {}) {
  return { prepare(sql) {
    return { bind(...args) {
      return {
        async first() {
          assert.match(sql, /auth_sessions/);
          assert.equal(args[0], hash);
          return disabled ? null : { id: 'u1', display_name: 'Test Admin', is_global_admin: globalAdmin ? 1 : 0 };
        },
        async all() {
          if (sql.includes('auth_team_memberships')) return { results: [{ team_id: membership, role }] };
          if (sql.includes('auth_user_permissions')) return { results: [{ permission }] };
          throw Error('Unexpected query');
        }
      };
    }};
  }};
}
const request = (team = '18', auth = token) => new Request('https://example.test/api/lagpersonal?team_id=' + team, {
  method: 'POST', headers: auth ? { Authorization: 'Bearer ' + auth } : {}
});
async function run(req, opts = {}) {
  let writes = 0;
  const result = await guardLagpersonalMutation(req, {
    verifyIdentity: createPersonalRosterIdentityVerifier({ AUTH_DB: db(opts) }),
    resolveTeamId: r => resolveLagpersonalTeam(r, { listTeams: async () => [{ id: 18 }, { id: 2 }] }),
    mutate: async () => { writes++; return { ok: true }; }
  });
  return { result, writes };
}
test('valid D1 personal session and team admin can write', async () => {
  const { result, writes } = await run(request());
  assert.equal(result.ok, true); assert.equal(writes, 1);
});
test('valid Team 18 session cannot write Team 2', async () => {
  const { result, writes } = await run(request('2'));
  assert.equal(result.status, 403); assert.equal(writes, 0);
});
test('viewer with permission cannot write', async () => {
  const { result, writes } = await run(request(), { role: 'viewer' });
  assert.equal(result.status, 403); assert.equal(writes, 0);
});
test('team admin without permission cannot write', async () => {
  const { result, writes } = await run(request(), { permission: 'pool:create' });
  assert.equal(result.status, 403); assert.equal(writes, 0);
});
test('revoked or disabled session cannot write', async () => {
  const { result, writes } = await run(request(), { disabled: true });
  assert.equal(result.status, 401); assert.equal(writes, 0);
});
test('missing D1 binding cannot write', async () => {
  let writes = 0;
  const result = await guardLagpersonalMutation(request(), {
    verifyIdentity: createPersonalRosterIdentityVerifier({}),
    resolveTeamId: async () => '18',
    mutate: async () => { writes++; }
  });
  assert.equal(result.status, 401); assert.equal(writes, 0);
});
test('malformed personal token cannot write', async () => {
  const { result, writes } = await run(request('18', 'bad'));
  assert.equal(result.status, 401); assert.equal(writes, 0);
});

test('verified global administrator flag comes from D1', async () => {
  const verifier = createPersonalRosterIdentityVerifier({ AUTH_DB: db({ globalAdmin: true }) });
  const actor = await verifier(token);
  assert.equal(actor.is_global_admin, true);
});
test('ordinary team administrator is not a global administrator', async () => {
  const verifier = createPersonalRosterIdentityVerifier({ AUTH_DB: db() });
  const actor = await verifier(token);
  assert.equal(actor.is_global_admin, false);
});
