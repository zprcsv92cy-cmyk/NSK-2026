import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { stagingRoster } from './staging-roster.js';

const admin = { memberships: [{ team_id: 'team-18', role: 'team_admin' }], permissions: ['roster:manage'] };
const json = (body, status = 200) => ({ body, status });
const request = (method, team, body) => new Request('https://example.test/api/auth/roster-staging?team_id=' + team, {
  method, ...(body ? { body: JSON.stringify(body) } : {})
});
function store() {
  const calls = [];
  return { calls, prepare(sql) {
    const entry = { sql, args: [] }; calls.push(entry);
    return { bind(...args) {
      entry.args = args;
      return { all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) };
    } };
  } };
}
test('authorized read scopes database query to membership team', async () => {
  const db = store();
  const result = await stagingRoster(request('GET', 'team-18'), db, admin, json);
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls[0].args, ['team-18']);
});
test('cross-team reads and writes never access database', async () => {
  const db = store();
  const read = await stagingRoster(request('GET', 'team-2'), db, admin, json);
  const write = await stagingRoster(request('POST', 'team-2', { kind: 'player', name: 'Test' }), db, admin, json);
  assert.equal(read.status, 403);
  assert.equal(write.status, 403);
  assert.equal(db.calls.length, 0);
});
test('coach can read but cannot write', async () => {
  const db = store();
  const coach = { memberships: [{ team_id: 'team-18', role: 'coach' }], permissions: ['roster:manage'] };
  const read = await stagingRoster(request('GET', 'team-18'), db, coach, json);
  const write = await stagingRoster(request('POST', 'team-18', { kind: 'player', name: 'Test' }), db, coach, json);
  assert.equal(read.body.canManage, false);
  assert.equal(write.status, 403);
  assert.equal(db.calls.length, 1);
});
test('authorized POST writes to own team', async () => {
  const db = store();
  const result = await stagingRoster(request('POST', 'team-18', { kind: 'player', name: 'Test' }), db, admin, json);
  assert.equal(result.status, 201);
  assert.equal(db.calls[0].args[1], 'team-18');
});

test('PATCH is scoped to authenticated team', async () => {
  const db = store();
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const req = new Request('https://example.test/api/auth/roster-staging/' + id + '?team_id=team-18', {
    method: 'PATCH', body: JSON.stringify({ name: 'Updated' })
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls[0].args, ['Updated', id, 'team-18']);
});
test('DELETE is scoped to authenticated team', async () => {
  const db = store();
  const id = '123e4567-e89b-42d3-a456-426614174000';
  const req = new Request('https://example.test/api/auth/roster-staging/' + id + '?team_id=team-18', { method: 'DELETE' });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 200);
  assert.deepEqual(db.calls[0].args, [id, 'team-18']);
});

test('unknown staging route is rejected before database access', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging/not-a-uuid?team_id=team-18', { method: 'DELETE' });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 404);
  assert.equal(db.calls.length, 0);
});
test('unsupported collection method is rejected before database access', async () => {
  const db = store();
  const result = await stagingRoster(request('DELETE', 'team-18'), db, admin, json);
  assert.equal(result.status, 405);
  assert.equal(db.calls.length, 0);
});

test('malformed row identifiers are rejected without database access', async () => {
  const db = store();
  for (const id of ['not-a-uuid', '------------------------------------', '123e4567-e89b-42d3-a456-42661417400z']) {
    const req = new Request('https://example.test/api/auth/roster-staging/' + id + '?team_id=team-18', { method: 'DELETE' });
    const result = await stagingRoster(req, db, admin, json);
    assert.equal(result.status, 404, id);
  }
  assert.equal(db.calls.length, 0);
});

test('oversized write is rejected before database access', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST',
    headers: { 'Content-Length': '2049' },
    body: JSON.stringify({ kind: 'player', name: 'Test' })
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 413);
  assert.equal(db.calls.length, 0);
});

test('oversized actual body is rejected even without Content-Length', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST',
    body: JSON.stringify({ kind: 'player', name: 'X'.repeat(3000) })
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 413);
  assert.equal(db.calls.length, 0);
});
test('valid explicit Content-Length does not block authorized small writes', async () => {
  const db = store();
  const body = JSON.stringify({ kind: 'player', name: 'Test' });
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST', headers: { 'Content-Length': String(new TextEncoder().encode(body).length) }, body
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 201);
  assert.equal(db.calls.length, 1);
});

test('malformed JSON is rejected without database access', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST', body: '{"kind":'
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 400);
  assert.equal(db.calls.length, 0);
});

test('non-object JSON is rejected without database access', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST', body: 'null'
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 400);
  assert.equal(db.calls.length, 0);
});

test('invalid UTF-8 JSON is rejected without database access', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST', body: new Uint8Array([0x7b,0x22,0x61,0x22,0x3a,0xff,0x7d])
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 400);
  assert.equal(db.calls.length, 0);
});

test('POST rejects non-string role and name without database access', async () => {
  for (const payload of [
    { kind: ['player'], name: 'Test' },
    { kind: 'player', name: ['Test'] },
    { kind: 'player', name: { toString: 'Test' } }
  ]) {
    const db = store();
    const result = await stagingRoster(request('POST', 'team-18', payload), db, admin, json);
    assert.equal(result.status, 400);
    assert.equal(db.calls.length, 0);
  }
});
test('PATCH rejects non-string name without database access', async () => {
  const db = store();
  const req = new Request('https://example.test/api/auth/roster-staging/123e4567-e89b-42d3-a456-426614174000?team_id=team-18', {
    method: 'PATCH', body: JSON.stringify({ name: ['Test'] })
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 400);
  assert.equal(db.calls.length, 0);
});

test('multibyte UTF-8 write is limited by bytes, not character count', async () => {
  const db = store();
  const body = JSON.stringify({ kind: 'player', name: 'å'.repeat(1100) });
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST', body
  });
  const result = await stagingRoster(req, db, admin, json);
  assert.equal(result.status, 413);
  assert.equal(db.calls.length, 0);
});

test('unauthorized write is rejected before reading the request body', async () => {
  const db = store();
  const coach = { memberships: [{ team_id: 'team-18', role: 'coach' }], permissions: [] };
  const req = new Request('https://example.test/api/auth/roster-staging?team_id=team-18', {
    method: 'POST', body: JSON.stringify({ kind: 'player', name: 'Test' })
  });
  const result = await stagingRoster(req, db, coach, json);
  assert.equal(result.status, 403);
  assert.equal(req.bodyUsed, false);
  assert.equal(db.calls.length, 0);
});


test('Team 18 administrator can edit Team 18 but not Testlag 2', async () => {
  const db = store();
  const actor = {
    memberships: [{ team_id: 'NSK Team 18', role: 'team_admin' }],
    permissions: ['roster:manage']
  };
  const own = await stagingRoster(request('POST', 'NSK%20Team%2018', {
    kind: 'player', name: 'NSK TESTSPELARE'
  }), db, actor, json);
  assert.equal(own.status, 201);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].args[1], 'NSK Team 18');
  const other = await stagingRoster(request('POST', 'NSK%20Testlag%202', {
    kind: 'player', name: 'MUST NOT SAVE'
  }), db, actor, json);
  assert.equal(other.status, 403);
  assert.equal(db.calls.length, 1, 'cross-team write must not touch the database');
});
test('Testlag 2 administrator cannot edit Team 18', async () => {
  const db = store();
  const actor = {
    memberships: [{ team_id: 'NSK Testlag 2', role: 'team_admin' }],
    permissions: ['roster:manage']
  };
  const response = await stagingRoster(request('POST', 'NSK%20Team%2018', {
    kind: 'player', name: 'MUST NOT SAVE'
  }), db, actor, json);
  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});


test('staging roster accepts the five supported team roles', async () => {
  for (const kind of ['player', 'coach', 'team_manager', 'fitness', 'equipment']) {
    const db = store();
    const result = await stagingRoster(request('POST', 'team-18', {
      kind, name: 'NSK TEST'
    }), db, admin, json);
    assert.equal(result.status, 201, kind);
    assert.equal(db.calls.length, 1, kind);
    assert.equal(db.calls[0].args[2], kind);
  }
});
test('staging roster rejects unknown role without writing', async () => {
  const db = store();
  const result = await stagingRoster(request('POST', 'team-18', {
    kind: 'team_admin', name: 'NSK TEST'
  }), db, admin, json);
  assert.equal(result.status, 400);
  assert.equal(db.calls.length, 0);
});


test('PATCH and DELETE cannot modify a row belonging to another team', async () => {
  const id = '123e4567-e89b-42d3-a456-426614174000';
  for (const method of ['PATCH', 'DELETE']) {
    const db = store();
    const req = new Request(
      'https://example.test/api/auth/roster-staging/' + id + '?team_id=team-18',
      { method, ...(method === 'PATCH'
        ? { body: JSON.stringify({ name: 'CHANGED' }) } : {}) }
    );
    const result = await stagingRoster(req, db, admin, json);
    assert.equal(result.status, 200);
    assert.equal(db.calls.length, 1);
    assert.match(db.calls[0].sql, /WHERE id=\? AND team_id=\?/);
    assert.equal(db.calls[0].args.at(-1), 'team-18');
  }
});
