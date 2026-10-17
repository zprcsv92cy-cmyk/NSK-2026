// Read-only source audit. Production must NOT be deployed merely because staging tests pass.
// Usage: node scripts/check-production-auth-readiness.mjs [--require-ready]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const db = read('db.js');
const truppen = read('truppen/index.html');
const legacyWorkerConfig = read('wrangler.auth.staging.toml');

// This is a deliberately conservative release gate. Each finding requires
// concrete remediation and independent integration tests before it can be cleared.
const findings = [];
if (/fetch\(\x60\$\{API\}\/api\/\$\{table\}/.test(db) ||
    /fetch\(\x60\$\{API\}\/api\/lagpersonal/.test(db)) {
  findings.push('Legacy team-data reads still call the production API without a personal session.');
}
if (/nsk_admin_token|adminRequest\(/.test(db) ||
    /nsk_admin_token|admin-mode\.js/.test(truppen)) {
  findings.push('Legacy shared-admin authentication is still in the app write path.');
}
if (/NSK Team 18/.test(db)) {
  findings.push('The current team is still selected by a hard-coded team name rather than a server-verified membership.');
}
if (/LEGACY_API/.test(legacyWorkerConfig)) {
  findings.push('Staging configuration references LEGACY_API; review isolation before any rollout.');
}
// Manual production release prerequisites are *not* inferable from repository source.
findings.push('Authenticated live cross-team integration and end-to-end regression tests need explicit evidence.');
findings.push('Production backup restore rehearsal, rollback approval and release authorization need explicit evidence.');

const result = { ready: findings.length === 0, findings };
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes('--require-ready') && !result.ready) {
  console.error('PRODUCTION BLOCKED: all findings must be resolved and verified.');
  process.exitCode = 1;
}
