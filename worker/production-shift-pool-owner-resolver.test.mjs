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
    '1255101/12': { Lag: [{ id: 91 }, { id: 92 }], 'Antal lag': 2 },
    '1255083/92': { id: 92, Namn: 'NSK Testlag 2' }
  });
  const owner = await createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: 2, teamId: 'NSK Team 18' });
  assert.deepEqual(owner, { teamId: 'NSK Testlag 2', teamName: 'NSK Testlag 2', baserowTeamRowId: '92', poolId: 12 });
  assert.deepEqual(db.requested, [base + '1255101/12/?user_field_names=true', base + '1255083/92/?user_field_names=true']);
});

test('derives both pool and team position from trusted shift row', async () => {
  const db = fakeBaserow({
    '1255115/31': { Poolspel: [{ id: 12 }], Lagnummer: 2 },
    '1255101/12': { Lag: [{ id: 91 }, { id: 92 }], 'Antal lag': 2 },
    '1255083/92': { id: 92, Namn: 'NSK Testlag 2' }
  });
  const owner = await createPoolOwnerResolver(env, db.fetchImpl)({ shiftRowId: 31, poolId: 999, lagNo: 1 });
  assert.equal(owner.teamId, 'NSK Testlag 2');
  assert.equal(owner.poolId, 12);
});

test('fails closed when requested team position is not linked to a multi-team pool', async () => {
  const db = fakeBaserow({ '1255101/12': { Lag: [{ id: 91 }, { id: 92 }], 'Antal lag': 2 } });
  await assert.rejects(createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: 3 }), /Ogiltigt lagnummer för poolspelet/);
  assert.equal(db.requested.length, 1);
});

test('fails closed on mismatched Baserow team identity', async () => {
  const db = fakeBaserow({
    '1255101/12': { Lag: [{ id: 91 }], 'Antal lag': 1 },
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

test('one linked association team owns every numbered squad in its pool', async () => {
  const db = fakeBaserow({
    '1255101/12': { Lag: [{ id: 91 }], 'Antal lag': 3 },
    '1255083/91': { id: 91, Namn: 'NSK Team 18' }
  });
  for (const lagNo of [1, 2, 3]) {
    const owner = await createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo });
    assert.equal(owner.teamId, 'NSK Team 18');
  }
});

test('rejects squad beyond configured pool team count', async () => {
  const db = fakeBaserow({ '1255101/12': { Lag: [{ id: 91 }], 'Antal lag': 2 } });
  await assert.rejects(createPoolOwnerResolver(env, db.fetchImpl)({ poolId: 12, lagNo: 3 }), /Ogiltigt lagnummer/);
  assert.equal(db.requested.length, 1);
});


test('uses only configured isolated Baserow tables for owner lookup', async () => {
  const isolated = { ...env, BASEROW_TABLE_IDS: JSON.stringify({ lag: 991, poolspel: 992, bytesschema: 993 }) };
  const db = fakeBaserow({
    '993/31': { Poolspel: [{ id: 12 }], Lagnummer: 1 },
    '992/12': { Lag: [{ id: 91 }], 'Antal lag': 1 },
    '991/91': { id: 91, Namn: 'NSK Testlag 2' }
  });
  const owner = await createPoolOwnerResolver(isolated, db.fetchImpl)({ shiftRowId: 31 });
  assert.equal(owner.teamId, 'NSK Testlag 2');
  assert.deepEqual(db.requested.map(x => x.split('/').slice(0, 2).join('/')), ['993/31', '992/12', '991/91']);
});

test('rejects missing or invalid isolated table mapping without legacy fallback', async () => {
  for (const mapping of ['{}', '{"lag":991,"poolspel":992}', '{"lag":991,"poolspel":992,"bytesschema":0}', '{"lag":1255083,"poolspel":992,"bytesschema":993}', 'not-json']) {
    const db = fakeBaserow({});
    const isolated = { ...env, BASEROW_TABLE_IDS: mapping };
    await assert.rejects(createPoolOwnerResolver(isolated, db.fetchImpl)({ shiftRowId: 31 }));
    assert.equal(db.requested.length, 0);
  }
});
