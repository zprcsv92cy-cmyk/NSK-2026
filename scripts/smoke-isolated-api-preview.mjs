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
// /health intentionally depends on Baserow; no production Baserow token in Preview.
console.log('Preview denies all anonymous scoped reads. No writes or secrets used.');
