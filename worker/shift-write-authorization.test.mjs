import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { authorizeShiftWrite } from './shift-write-authorization.js';

const actor = { memberships: [{ team_id: '18', role: 'team_admin' }], permissions: ['shifts:check'] };
test('allows shift write only for verified pool owner and explicit permission', async () => {
  let writes = 0;
  const result = await authorizeShiftWrite(actor, 42, {
    findPoolOwner: async () => '18',
    mutate: async () => { writes++; return { ok: true }; }
  });
  assert.equal(result.ok, true);
  assert.equal(writes, 1);
});
test('denies another team, missing grant, missing identity and unknown owner without mutation', async () => {
  let writes = 0;
  const mutate = () => { writes++; return { ok: true }; };
  for (const [identity, owner, expected] of [
    [actor, '2', 403],
    [{ ...actor, permissions: [] }, '18', 403],
    [null, '18', 401],
    [actor, '', 403]
  ]) {
    const result = await authorizeShiftWrite(identity, 42, { findPoolOwner: async () => owner, mutate });
    assert.equal(result.status, expected);
  }
  assert.equal(writes, 0);
});
test('fails closed when pool lookup fails', async () => {
  let writes = 0;
  const result = await authorizeShiftWrite(actor, 42, {
    findPoolOwner: async () => { throw Error('offline'); },
    mutate: () => { writes++; }
  });
  assert.equal(result.status, 503);
  assert.equal(writes, 0);
});

test('rejects an overlong server-resolved team identifier before mutation', async () => {
  let writes = 0;
  const result = await authorizeShiftWrite(actor, 42, {
    findPoolOwner: async () => 'x'.repeat(101),
    mutate: async () => { writes++; return { ok: true }; }
  });
  assert.equal(result.status, 403);
  assert.equal(writes, 0);
});
