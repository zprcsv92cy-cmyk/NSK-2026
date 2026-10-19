import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const failures = [], blockers = [];
const run = (label, args) => {
  const result = spawnSync('node', args, { stdio: 'inherit' });
  if (result.error || result.status !== 0) failures.push(label);
  console.log(label + ': ' + (result.status === 0 ? 'PASS' : 'FAIL'));
};
const source = readFileSync('worker/production-api-v42-reference.js', 'utf8');
const config = readFileSync('wrangler.api.production.toml', 'utf8');
const frontend = readFileSync('db.js', 'utf8');
console.log('=== NSK non-destructive release audit ===');
run('Worker syntax', ['--check', 'worker/production-api-v42-reference.js']);
run('Frontend syntax', ['--check', 'db.js']);
run('All Worker tests', ['--test', ...readdirSync('worker').filter(name => name.endsWith('.test.mjs')).map(name => 'worker/' + name)]);
// Report effective rollout coverage, not merely the presence of the legacy router.
const hasRosterGuard = source.includes('NSK_REQUIRE_SCOPED_ROSTER_READS === "true"') &&
  source.includes('createProductionRosterReadHandler(env');
const hasCollectionGuard = source.includes('NSK_REQUIRE_SCOPED_COLLECTION_READS === "true"') &&
  source.includes('readPersonallyAuthorizedTeamCollection(req, env');
const hasLegacyDenial = source.includes('["matcher", "malvaktsstatistik", "spelaretranare"].includes(m[1])') &&
  source.includes('Behörighetskontrollerad läsning krävs');
const legacyFallback = source.includes('Object.hasOwn(TABLES, m[1])');
if (!hasRosterGuard) blockers.push('Roster GET authorization guard is missing');
if (!hasCollectionGuard) blockers.push('Four scoped collection GET authorization guards are missing');
if (!hasLegacyDenial) blockers.push('Remaining three sensitive collections are not denied under mandatory rollout');
if (legacyFallback) {
  console.log('Legacy GET router: present; verify effective routing per table and rollout flag');
  console.log('  Roster: ' + (hasRosterGuard ? 'guarded when roster flag is true' : 'NOT GUARDED'));
  console.log('  Pool/config/lineups/shifts: ' + (hasCollectionGuard ? 'guarded when collection flag is true' : 'NOT GUARDED'));
  console.log('  Matches/goalkeeper/player-coach: ' + (hasLegacyDenial ? 'denied when collection flag is true' : 'UNPROTECTED'));
  blockers.push('Generic GET fallback remains for /api/lag; team-list disclosure and authorization policy need explicit review');
  if (!/NSK_REQUIRE_SCOPED_COLLECTION_READS\s*=\s*"true"/.test(config))
    blockers.push('With collection flag disabled, legacy unauthenticated GET can still expose pool, match configuration, lineup, shift and other table data');
}
if (!/NSK_REQUIRE_SCOPED_COLLECTION_READS\s*=\s*"true"/.test(config))
  blockers.push('Production manifest does not force scoped collection reads');
if (!/REQUIRE_SCOPED_COLLECTION_READS/.test(frontend))
  blockers.push('Frontend scoped collection rollout flag not found');
if (!/NSK_REQUIRE_SCOPED_ROSTER_READS\s*=\s*"true"/.test(config))
  blockers.push('Production manifest does not force scoped roster reads');
const gate = spawnSync('node', ['scripts/check-api-production-release.mjs'], { encoding: 'utf8' });
console.log('Production gate: ' + (gate.status === 0 ? 'PASS (live verification still required)' : 'BLOCKED'));
if (gate.status !== 0) {
  blockers.push('Production release gate: live checks, rollback verification and explicit approval outstanding');
  console.log((gate.stderr || gate.stdout || '').trim());
}
console.log('\n=== Summary ===');
console.log('Automated failures: ' + failures.length);
for (const item of failures) console.log('FAIL: ' + item);
console.log('Release blockers: ' + blockers.length);
for (const item of blockers) console.log('BLOCK: ' + item);
console.log('No deployment, Cloudflare writes, secret reads or live data mutations were performed.');
if (failures.length || blockers.length) process.exitCode = 1;
