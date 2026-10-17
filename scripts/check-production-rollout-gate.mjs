// Deployment readiness gate: explicitly document unmigrated legacy dependencies.
// This never deploys, alters database contents or accesses Cloudflare secrets.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const config=read('config.js');
const entry=read('worker/production-entry-candidate.js');
const wrangler=read('wrangler.production.candidate.toml');
const web=read('db.js');
const snapshot=read('reference/legacy-nsk-api-worker-v42.snapshot.js');

const requiredLegacyRoutes=[
 '/api/admin/status',
 '/api/coach-selection',
 '/api/bytesschema/save',
 '/api/match/login',
 '/api/poolspel'
];
// Maintain a strict fail-closed rollout until every dependency is moved.
assert.match(config,/AUTH_MODE:\s*["']staging["']/,
  'FAIL: browser switched to production before final approval');
assert.match(entry,/Legacy API route not migrated/,
  'FAIL: legacy API protection was removed without audit');
assert.match(wrangler,/DRY RUN ONLY, DO NOT DEPLOY/,
  'FAIL: candidate deployment warning removed');
assert.match(wrangler,/nsk-auth-production/,
  'FAIL: wrong production auth DB');
assert.doesNotMatch(wrangler,/^\s*database_id\s*=\s*"b5a439d1-/m,
  'FAIL: staging auth database configured for production');
for(const route of requiredLegacyRoutes){
  assert.ok(web.includes(route)||snapshot.includes(route),
    'Update migration inventory for '+route);
}
console.log('PASS candidate remains gated; production switch is off');
console.log('KNOWN BLOCKER: unmigrated legacy APIs, production account provisioning and rollback verification');
