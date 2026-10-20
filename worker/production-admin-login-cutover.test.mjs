import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './production-api-v42-reference.js';

test('full personal rollout refuses shared admin login without KV or external network',async()=>{
  const env={
    NSK_REQUIRE_PERSONAL_POOL_WRITES:'true',
    NSK_REQUIRE_PERSONAL_MATCH_WRITES:'true',
    NSK_REQUIRE_PERSONAL_COACH_SELECTION:'true'
  };
  const request=new Request('https://test.invalid/api/admin/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({password:'irrelevant'})
  });
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>{throw Error('unexpected external request');};
  try{
    const response=await worker.fetch(request,env);
    assert.equal(response.status,410);
    const result=await response.json();
    assert.match(result.error,/personlig inloggning/i);
  }finally{globalThis.fetch=previous;}
});
test('legacy mode continues to use its original admin-login route',async()=>{
  const response=await worker.fetch(new Request('https://test.invalid/api/admin/login',{method:'POST'}),{});
  assert.equal(response.status,503);
});
