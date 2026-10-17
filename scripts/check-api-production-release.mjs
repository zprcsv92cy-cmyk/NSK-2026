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
const issues = [];
if (!source || !source.startsWith('worker/') || !existsSync(source)) issues.push('Worker entrypoint missing or invalid');
if (!hasD1) issues.push('AUTH_DB D1 binding missing');
if (!hasKV('ADMIN_KV')) issues.push('ADMIN_KV KV namespace missing');
if (!hasKV('NSK_TRAINERS')) issues.push('NSK_TRAINERS KV namespace missing');
if (!hasDO) issues.push('SHIFT_LOCK Durable Object binding missing');
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
