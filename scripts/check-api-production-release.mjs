import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const config = readFileSync('wrangler.api.production.toml', 'utf8');
const required = ['AUTH_DB', 'ADMIN_KV', 'NSK_TRAINERS', 'SHIFT_LOCK'];
const missing = required.filter(name => !new RegExp('^\\s*(?:binding|name)\\s*=\\s*"' + name + '"\\s*$', 'm').test(config));
const source = /^main\s*=\s*"([^"]+)"/m.exec(config)?.[1];
const blocked = !source || missing.length || /intentionally incomplete|not a deployable/i.test(config);
if (blocked) {
  console.error('API production deployment BLOCKED: incomplete verified configuration.');
  if (!source) console.error('- Missing Worker main entrypoint');
  if (missing.length) console.error('- Missing binding declarations: ' + missing.join(', '));
  console.error('- Preserve existing secrets, KV, Durable Object and rollback before release.');
  process.exitCode = 1;
} else {
  assert.ok(source.startsWith('worker/'), 'Worker entrypoint must be in worker/');
  console.log('Static configuration checks passed; live binding and rollback verification still required.');
}
