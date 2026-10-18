import { readFileSync, existsSync } from 'node:fs';
const config = readFileSync('wrangler.api.production.toml', 'utf8');
const source = /^main\s*=\s*"([^"]+)"/m.exec(config)?.[1];
const kv = [...config.matchAll(/\[\[kv_namespaces\]\]([\s\S]*?)(?=\n\s*\[|$)/g)].map(m => m[1]);
const d1 = [...config.matchAll(/\[\[d1_databases\]\]([\s\S]*?)(?=\n\s*\[|$)/g)].map(m => m[1]);
const durable = /\[durable_objects\][\s\S]*?\[\[durable_objects\.bindings\]\]([\s\S]*?)(?=\n\s*\[|$)/g;
const objects = [...config.matchAll(durable)].map(m => m[1]);
const field = (section, name) => new RegExp('^\\s*' + name + '\\s*=\\s*"([^"]+)"', 'm').exec(section)?.[1];
const hasKV = name => kv.some(s => field(s, 'binding') === name && /^[a-f0-9]{32}$/i.test(field(s, 'id') || ''));
const hasD1 = d1.some(s => field(s, 'binding') === 'AUTH_DB' && /^[a-f0-9-]{36}$/i.test(field(s, 'database_id') || ''));
const hasDO = objects.some(s => field(s, 'name') === 'SHIFT_LOCK' && field(s, 'class_name') === 'ShiftLock');
const migrations = [...config.matchAll(/\[\[migrations\]\]([\s\S]*?)(?=\n\s*\[|$)/g)].map(m => m[1]);
const hasShiftLockMigration = migrations.some(s => field(s, 'tag') === 'v1-shift-lock' && /^\s*new_sqlite_classes\s*=\s*\[\s*"ShiftLock"\s*\]/m.test(s));
const shiftLockExport = /^\\[exports\\.ShiftLock\\]([\\s\\S]*?)(?=\\n\\s*\\[|(?![\\s\\S]))/m.exec(config)?.[1] || '';
const hasShiftLockSQLiteExport = field(shiftLockExport, 'type') === 'durable-object' && field(shiftLockExport, 'storage') === 'sqlite';
const issues = [];
if (!source || !source.startsWith('worker/') || !existsSync(source)) issues.push('Worker entrypoint missing or invalid');
if (!hasD1) issues.push('AUTH_DB D1 binding missing');
if (!hasKV('ADMIN_KV')) issues.push('ADMIN_KV KV namespace missing');
if (!hasKV('NSK_TRAINERS')) issues.push('NSK_TRAINERS KV namespace missing');
if (!hasDO) issues.push('SHIFT_LOCK Durable Object binding missing');
const expectedBindings = {
  ADMIN_KV: '7f978e9bbcd04b888e5b0dfbc338ba5d',
  NSK_TRAINERS: 'f60b048621ea4aca8d67774f5c9db664',
};
for (const [name, expectedId] of Object.entries(expectedBindings)) {
  if (!kv.some(section => field(section, 'binding') === name && field(section, 'id') === expectedId)) {
    issues.push(name + ' does not match verified production namespace');
  }
}
if (!d1.some(section => field(section, 'binding') === 'AUTH_DB' && field(section, 'database_id') === '9f937bcb-b0c0-4129-af5b-775cf284dfcb')) {
  issues.push('AUTH_DB does not match verified production database');
}

const secretsSection = /^\[secrets\]([\s\S]*?)(?=\n\s*\[|(?![\s\S]))/m.exec(config)?.[1] || '';
const requiredSecrets = /^\s*required\s*=\s*\[([^\]]*)\]/m.exec(secretsSection)?.[1] || '';
const declaredSecretNames = [...requiredSecrets.matchAll(/"([^"]+)"/g)].map(m => m[1]);
for (const name of ['ADMIN_PASSWORD', 'BASEROW_TOKEN', 'MATCH_PASSWORD']) {
  if (!declaredSecretNames.includes(name)) issues.push(name + ' required secret declaration missing');
}
const varsSection = /^\[vars\]([\s\S]*?)(?=\n\s*\[|(?![\s\S]))/m.exec(config)?.[1] || '';
const hasBaserowDatabaseId = /^\s*BASEROW_DATABASE_ID\s*=\s*(?:"[^"]+"|'[^']+')\s*$/m.test(varsSection);
if (!hasBaserowDatabaseId) issues.push('BASEROW_DATABASE_ID declaration missing');
if (!hasShiftLockMigration && !hasShiftLockSQLiteExport) issues.push('Existing SHIFT_LOCK migration or SQLite export declaration missing');
if (/intentionally incomplete|not a deployable/i.test(config)) issues.push('Manifest explicitly marked incomplete');
if (process.env.NSK_API_PRODUCTION_RELEASE_APPROVED !== 'yes') issues.push('Explicit production release approval missing');
if (issues.length) {
  console.error('API production deployment BLOCKED: incomplete verified configuration.');
  for (const issue of issues) console.error('- ' + issue);
  console.error('- Preserve live secrets and confirm rollback separately before any deployment.');
  process.exitCode = 1;
} else {
  console.log('Static declarations and explicit approval passed; live binding IDs, secrets, migrations and rollback still require verification.');
}
