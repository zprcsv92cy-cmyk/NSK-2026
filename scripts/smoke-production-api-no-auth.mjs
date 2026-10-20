import assert from 'node:assert/strict';

const root = process.env.NSK_API_SMOKE_URL || 'https://nsk-api.peter-hasselberg.workers.dev';
const base = new URL(root);
if (base.protocol !== 'https:' || base.hostname !== 'nsk-api.peter-hasselberg.workers.dev' ||
    base.pathname !== '/' || base.search || base.hash) {
  throw new Error('Smoke test must target the verified production API hostname only');
}

const checks = [
  ['/api/spelare?team_id=1255083', 'roster'],
  ['/api/tranare?team_id=1255083', 'coaches'],
  ['/api/lagpersonal?team_id=1255083', 'staff'],
  ['/api/lag', 'teams'],
  ['/api/poolspel?team_id=1255083', 'pools'],
  ['/api/matchkonfiguration?team_id=1255083', 'match configurations'],
  ['/api/laguppstallningar?team_id=1255083', 'lineups'],
  ['/api/bytesschema?team_id=1255083', 'shifts'],
  ['/api/spelaretranare?team_id=1255083', 'player-coach links']
];

for (const [path, label] of checks) {
  const url = new URL(path, base);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
  console.log(label + ': HTTP ' + response.status);
  assert.ok([401, 403].includes(response.status), label + ' unexpectedly returned ' + response.status);
  await response.body?.cancel();
}
console.log('Unauthenticated scoped GETs all denied; no write requests or credentials used.');
