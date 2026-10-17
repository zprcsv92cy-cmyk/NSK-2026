import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoolOwnerResolver } from './production-shift-pool-owner-resolver.js';

const base = 'https://api.baserow.io/api/database/rows/table/';
function response(value, ok = true) {
  return { ok, json: async () => value };
}
function fakeBaserow(rows) {
  const requested = [];
  const fetchImpl = async (url, options) => {
    requested.push(url);
    assert.equal(options.headers.Authorization, 'Token test-token');
    const match = url.match(/table\/(\d+)\/(\d+)\//);
    assert.ok(match, 'Only Baserow row reads are allowed');
    const key = match[1] + '/' + match[2];
    return key in rows ? response(rows[key]) : response({}, false);
  };
  return { fetchImpl, requested };
}
const env = { BASEROW_TOKEN: 'test-token' };

test('resolves pool team from trusted Baserow records, not a client team name', async () => {
  const db = fakeBaserow({
    '1255101/12': { Lag: [{ id: 91 }, { id: 92 }] },
    '1255083/92': { id: 92, Namn: 'NSK Testlag 2' }
  });
  const owner = await createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: 2, teamId: 'NSK Team 18' });
  assert.deepEqual(owner, { teamId: 'NSK Testlag 2', teamName: 'NSK Testlag 2', baserowTeamRowId: '92', poolId: 12 });
  assert.deepEqual(db.requested, [base + '1255101/12/?user_field_names=true', base + '1255083/92/?user_field_names=true']);
});

test('derives both pool and team position from trusted shift row', async () => {
  const db = fakeBaserow({
    '1255115/31': { Poolspel: [{ id: 12 }], Lagnummer: 2 },
    '1255101/12': { Lag: [{ id: 91 }, { id: 92 }] },
    '1255083/92': { id: 92, Namn: 'NSK Testlag 2' }
  });
  const owner = await createPoolOwnerResolver(env, db.fetchImpl)({ shiftRowId: 31, poolId: 999, lagNo: 1 });
  assert.equal(owner.teamId, 'NSK Testlag 2');
  assert.equal(owner.poolId, 12);
});

test('fails closed when requested team position is not linked to the pool', async () => {
  const db = fakeBaserow({ '1255101/12': { Lag: [{ id: 91 }] } });
  await assert.rejects(createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: 2 }), /Poolspel saknar angivet lag/);
  assert.equal(db.requested.length, 1);
});

test('fails closed on mismatched Baserow team identity', async () => {
  const db = fakeBaserow({
    '1255101/12': { Lag: [{ id: 91 }] },
    '1255083/91': { id: 999, Namn: 'NSK Team 18' }
  });
  await assert.rejects(createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: 1 }), /Lagets identitet kunde inte verifieras/);
});

test('fails closed on missing Baserow token and malformed IDs', async () => {
  const db = fakeBaserow({});
  await assert.rejects(createPoolOwnerResolver({}, db.fetchImpl)({ poolId: 12, lagNo: 1 }));
  await assert.rejects(createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 0, lagNo: 1 }));
  await assert.rejects(createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: -1 }));
  assert.equal(db.requested.length, 0);
});
