import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { guardShiftRoute } from './production-shift-route-guard.js';

const actor = { memberships: [{ team_id: '18', role: 'team_admin' }], permissions: ['shifts:check'] };
const env = { AUTH_DB: {} };
const verifyIdentity = async token => token === 'valid' ? actor : null;
const req = (path, body = {}, method = 'POST') => new Request('https://nsk.test' + path, {
  method, headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});

test('shift save authorizes the server-resolved pool owner before mutation', async () => {
  let writes = 0;
  const response = await guardShiftRoute(req('/api/bytesschema/save', { pool_id: 10, lag_no: 1, match_no: 2 }), env, {
    verifyIdentity, findPoolOwner: async ({ poolId, lagNo }) => ({ teamId: poolId === 10 && lagNo === 1 ? '18' : '2' }),
    mutate: async () => { writes++; return Response.json({ ok: true }); }
  });
  assert.equal(response.status, 200);
  assert.equal(writes, 1);
});

test('cross-team, missing identity and client-supplied team are denied before mutation', async () => {
  let writes = 0;
  const options = { verifyIdentity, findPoolOwner: async ({ poolId }) => ({ teamId: poolId === 10 ? '18' : '2' }), mutate: async () => { writes++; return Response.json({ ok: true }); } };
  assert.equal((await guardShiftRoute(req('/api/bytesschema/save', { pool_id: 11, lag_no: 1, match_no: 2 }), env, options)).status, 403);
  assert.equal((await guardShiftRoute(req('/api/bytesschema/save', { pool_id: 10, lag_no: 1, match_no: 2, team_id: '18' }), env, options)).status, 400);
  assert.equal((await guardShiftRoute(req('/api/bytesschema/save'), env, { ...options, verifyIdentity: async () => null })).status, 401);
  assert.equal(writes, 0);
});

test('fails closed when AUTH_DB or pool owner resolver is missing', async () => {
  assert.equal((await guardShiftRoute(req('/api/bytesschema/save', { pool_id: 10 }), {}, { verifyIdentity, findPoolOwner: async () => ({ teamId: '18' }), mutate: async () => {} })).status, 503);
  assert.equal((await guardShiftRoute(req('/api/bytesschema/save', { pool_id: 10 }), env, { verifyIdentity, mutate: async () => {} })).status, 503);
});

import { createPoolOwnerResolver } from './production-shift-pool-owner-resolver.js';
function fakeBaserow(rows) {
  return async url => {
    const match = String(url).match(/table\/(\d+)\/(\d+)\//);
    if (!match) return Response.json({}, { status: 404 });
    const row = rows[`${match[1]}:${match[2]}`];
    return row ? Response.json(row) : Response.json({}, { status: 404 });
  };
}
test('pool owner resolver uses trusted pool links and selected lag number', async () => {
  const resolver = createPoolOwnerResolver({ BASEROW_TOKEN: 'test' }, fakeBaserow({
    '1255101:40': { id: 40, Lag: [{ id: 8 }, { id: 18 }] },
    '1255083:18': { id: 18, Namn: 'NSK Team 18' }
  }));
  assert.deepEqual(await resolver({ poolId: 40, lagNo: 2 }), { teamId: '18', teamName: 'NSK Team 18', poolId: 40 });
});
test('pool owner resolver derives pool and lag from trusted shift row', async () => {
  const resolver = createPoolOwnerResolver({ BASEROW_TOKEN: 'test' }, fakeBaserow({
    '1255115:90': { id: 90, Poolspel: [{ id: 40 }], Lagnummer: 2 },
    '1255101:40': { id: 40, Lag: [{ id: 8 }, { id: 18 }] },
    '1255083:18': { id: 18, Namn: 'NSK Team 18' }
  }));
  assert.deepEqual(await resolver({ shiftRowId: 90 }), { teamId: '18', teamName: 'NSK Team 18', poolId: 40 });
});
test('pool owner resolver fails closed on invalid pool links', async () => {
  const resolver = createPoolOwnerResolver({ BASEROW_TOKEN: 'test' }, fakeBaserow({ '1255101:40': { id: 40, Lag: [] } }));
  await assert.rejects(() => resolver({ poolId: 40, lagNo: 1 }));
});
