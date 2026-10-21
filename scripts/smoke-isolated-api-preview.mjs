import assert from 'node:assert/strict';

const configuredBase = process.env.NSK_PREVIEW_BASE_URL;
assert.ok(configuredBase, 'Set NSK_PREVIEW_BASE_URL to the actual isolated Worker Preview URL; do not guess it.');
const parsedBase = new URL(configuredBase);
assert.equal(parsedBase.protocol, 'https:', 'Preview URL must use HTTPS');
assert.ok(parsedBase.hostname.endsWith('.workers.dev'), 'Preview URL must be on the workers.dev domain');
assert.equal(parsedBase.username, '', 'Preview URL must not contain credentials');
assert.equal(parsedBase.password, '', 'Preview URL must not contain credentials');
assert.equal(parsedBase.search, '', 'Preview URL must not contain query parameters');
assert.equal(parsedBase.hash, '', 'Preview URL must not contain a fragment');
const base = parsedBase.origin;
const targets = [
  '/api/lag',
  '/api/spelare?team_id=1',
  '/api/tranare?team_id=1',
  '/api/poolspel?team_id=1',
  '/api/matchkonfiguration?team_id=1',
  '/api/laguppstallningar?team_id=1',
  '/api/bytesschema?team_id=1',
  '/api/spelaretranare?team_id=1'
];
for (const path of targets) {
  const response = await fetch(base + path, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(12000)
  });
  console.log(path, response.status);
  assert.equal(response.status, 401, path + ' must deny anonymous read');
  await response.body?.cancel();
}

const deniedWrites = [
  ['POST','/api/poolspel',{name:'anonymous-denied'}],
  ['PATCH','/api/poolspel/42',{name:'anonymous-denied'}],
  ['PATCH','/api/poolspel/42/aktiv',{active:false}],
  ['POST','/api/matchkonfiguration',{pool_id:42}],
  ['PATCH','/api/matchkonfiguration/31',{pool_id:42}],
  ['POST','/api/laguppstallningar/31',{players:[]}],
  ['POST','/api/coach-selection',{pool_id:42,lag_no:1,match_no:1,coach_ids:[]}]
];
for(const [method,path,body] of deniedWrites){
  const response=await fetch(base+path,{
    method,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(body),
    redirect:'manual',
    signal:AbortSignal.timeout(12000)
  });
  console.log(method,path,response.status);
  assert.equal(response.status,401,method+' '+path+' must require personal login');
  await response.body?.cancel();
}
console.log('Preview denied anonymous writes; no authorized mutation performed.');
const invalidToken = 'not-a-valid-personal-session-token-0123456789';
const deniedInvalidToken = [
 ['GET','/api/spelare?team_id=1'],
 ['POST','/api/poolspel',{}],
 ['PATCH','/api/poolspel/42',{name:'should-not-save'}],
 ['POST','/api/matchkonfiguration',{pool_id:42}],
 ['POST','/api/laguppstallningar/31',{players:[],coaches:[]}],
 ['POST','/api/coach-selection',{pool_id:42,lag_no:1,match_no:1,coach_ids:[]}]
];
for(const [method,path,body] of deniedInvalidToken){
  const response=await fetch(base+path,{
    method,
    headers:{Authorization:'Bearer '+invalidToken,...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    redirect:'manual',signal:AbortSignal.timeout(12000)
  });
  console.log('Invalid token',method,path,response.status);
  assert.equal(response.status,401,'Invalid personal token must never authorize '+method+' '+path);
  await response.body?.cancel();
}
console.log('Invalid Bearer tokens rejected; no authorized mutation performed.');

// /health intentionally depends on Baserow; no production Baserow token in Preview.
console.log('Preview denies anonymous scoped reads. No Baserow access or authorized writes performed.');
