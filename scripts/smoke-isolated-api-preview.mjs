import assert from 'node:assert/strict';

const base = 'https://nsk-isolated-auth-20261020-nsk-api.peter-hasselberg.workers.dev';
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

// /health intentionally depends on Baserow; no production Baserow token in Preview.
console.log('Preview denies all anonymous scoped reads. No writes or secrets used.');
