import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './production-api-v42-reference.js';

/**
 * Executes the real production Worker router with isolated stub bindings.
 * No live Baserow / KV / D1 / Cloudflare requests are permitted.
 */
const env = {
  AUTH_DB: {},
  // Coach selection requires this binding before evaluating the personal session.
  NSK_TRAINERS: { get: async () => { throw Error('KV access before auth'); }, put: async () => { throw Error('KV write before auth'); } },
  NSK_REQUIRE_PERSONAL_POOL_WRITES: 'true',
  NSK_REQUIRE_PERSONAL_MATCH_WRITES: 'true',
  NSK_REQUIRE_PERSONAL_COACH_SELECTION: 'true',
  BASEROW_TOKEN: 'fake-local-value'
};
const cases = [
  ['create pool', 'POST', '/api/poolspel', {name:'test'}],
  ['update pool', 'PATCH', '/api/poolspel/42', {name:'test'}],
  ['finish pool', 'PATCH', '/api/poolspel/42/aktiv', {active:false}],
  ['reopen pool', 'PATCH', '/api/poolspel/42/aktiv', {active:true}],
  ['create match', 'POST', '/api/matchkonfiguration', {pool_id:42}],
  ['update match', 'PATCH', '/api/matchkonfiguration/31', {pool_id:42}],
  ['save lineup', 'POST', '/api/laguppstallningar/31', {players:[],coaches:[]}],
  ['read coach selection', 'GET', '/api/coach-selection?pool_id=42&lag_no=1&match_no=1'],
  ['save coach selection', 'POST', '/api/coach-selection', {pool_id:42,lag_no:1,match_no:1,coach_ids:[]}]
];

test('real Worker router rejects unauthenticated personal write paths without external I/O', async () => {
  const previousFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw Error('Unexpected external request'); };
  try {
    for (const [label,method,path,body] of cases) {
      const request = new Request('https://api.example.test' + path, {
        method,
        headers: body ? { 'Content-Type':'application/json' } : {},
        ...(body ? { body:JSON.stringify(body) } : {})
      });
      const response = await worker.fetch(request, env);
      assert.equal(response.status,401,label + ' must require personal session');
      assert.equal(externalCalls,0,label + ' must not access external data before denying');
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('pool finish requires a readback confirming that the pool was closed', async t => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });
  const team = { id: 18, Namn: 'NSK Team 18', Säsong: '2026' };
  const initial = { id: 42, Lag: [18], Aktiv: true, Status: { value: 'Aktiv' } };
  const closed = { ...initial, Aktiv: false, Status: { value: 'Avslutat' } };
  const authDb = {
    prepare(sql) {
      return { bind() { return {
        first: async () => ({ id: 'test-user', display_name: 'Test' }),
        all: async () => ({ results: sql.includes('auth_team_memberships')
          ? [{ team_id: team.Namn, role: 'coach' }]
          : [{ permission: 'pool:finish' }] })
      }; } };
    }
  };
  for (const persist of [false, true]) {
    let row = initial;
    let verified = false;
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(url).pathname;
      if (path.endsWith('/1255083/')) return Response.json({ results: [team], next: null });
      assert.ok(path.endsWith('/1255101/42/'), path);
      if (options.method === 'PATCH') {
        assert.deepEqual(JSON.parse(options.body), { Status: 'Avslutat', Aktiv: false });
        if (persist) row = closed;
        return Response.json(closed);
      }
      if (options.cache === 'no-store') verified = true;
      return Response.json(row);
    };
    const response = await worker.fetch(new Request('https://api.example.test/api/poolspel/42/aktiv', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + 'a'.repeat(43), 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false })
    }), { ...env, AUTH_DB: authDb });
    const result = await response.json();
    assert.equal(verified, true, JSON.stringify(result));
    assert.equal(response.status, persist ? 200 : 502);
    if (persist) assert.deepEqual(result.row, closed);
    else assert.match(result.error, /nya status kunde inte bekräftas/);
  }
});
