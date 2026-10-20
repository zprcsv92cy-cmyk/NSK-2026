/**
 * Read-only, fail-closed readiness check for an isolated D1 auth fixture.
 * No user, token, or membership records are read. No writes are performed.
 * Usage: NSK_TEST_D1_DATABASE_ID=<disposable-id> CLOUDFLARE_ACCOUNT_ID=...
 *        CLOUDFLARE_API_TOKEN=... node scripts/isolated-auth-fixture-readiness.mjs
 */
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const database = process.env.NSK_TEST_D1_DATABASE_ID;
const isolatedIntegration = 'b94c8dba-34be-4cff-a4e9-892caf4e3ddd';
const expectedAccount = '262a0356b18defd22b05df6949c409bf';
if (!account || !token || !database) throw Error('Missing Cloudflare credentials or isolated D1 database ID');
if (database !== isolatedIntegration || account !== expectedAccount) {
  throw Error('Refusing to inspect anything other than the approved isolated integration D1 database');
}
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`;
async function query(sql) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw Error(`D1 inspection failed (HTTP ${response.status})`);
  return payload.result?.[0]?.results ?? [];
}
const required = ['auth_users','auth_sessions','auth_team_memberships','auth_user_permissions','auth_global_admins'];
const existing = new Set((await query("SELECT name FROM sqlite_master WHERE type='table'")).map(row => row.name));
const missing = required.filter(name => !existing.has(name));
const counts = {};
for (const name of required.filter(name => existing.has(name))) {
  const rows = await query(`SELECT COUNT(*) AS count FROM "${name}"`);
  counts[name] = Number(rows[0]?.count ?? -1);
}
const ready = missing.length === 0 && counts.auth_users > 0 && counts.auth_sessions > 0 &&
  counts.auth_team_memberships > 0 && counts.auth_user_permissions > 0;
console.log(JSON.stringify({ isolatedDatabase: database, missingTables: missing, recordCounts: counts,
  minimumFixtureRowsPresent: ready, baserowIsolationVerified: false, authenticatedWriteReady: false }, null, 2));
if (!ready) process.exitCode = 1;
