import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './production-api-v42-reference.js';

/**
 * Executes the real production Worker router with isolated stub bindings.
 * No live Baserow / KV / D1 / Cloudflare requests are permitted.
 */
const env = {
  AUTH_DB: {},
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
