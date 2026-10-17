import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Historical compiled Worker snapshot. This is a structural audit, not a live test.
const source = readFileSync(new URL('../reference/legacy-nsk-api-worker-v42.snapshot.js', import.meta.url), 'utf8');
assert.match(source, /\/\/ src\/worker\.js/);
assert.match(source, /ADMIN_KV/, 'Existing production shared admin sessions must be inventoried');
assert.match(source, /BASEROW_TOKEN/, 'Existing Baserow integration must be inventoried');
assert.match(source, /NSK_TRAINERS/, 'Existing staff KV integration must be inventoried');

const staffRoute = source.indexOf('if (url.pathname === "/api/lagpersonal"');
assert.ok(staffRoute > 0, 'Staff route must be present');
const globalGetOnly = source.lastIndexOf('if (req.method !== "GET")', staffRoute);
assert.ok(globalGetOnly > 0 && globalGetOnly < staffRoute,
  'Expected GET-only gate ahead of staff route changed: re-audit routing');

// Fail safe: never certify personal-access production protection from a snapshot.
const report = {
  readyForPersonalAuthRelease: false,
  reference: 'User-provided compiled Worker (not byte-verified against Cloudflare)',
  issues: [
    'Legacy admin session is still used for production mutations',
    'Staff POST/PATCH routes appear after a GET-only gate',
    'No deployed personal-auth session verifier or server-owned numeric team mapping is wired',
    'A versioned source deployment and verified rollback/data backup are required'
  ]
};
console.log(JSON.stringify(report, null, 2));
