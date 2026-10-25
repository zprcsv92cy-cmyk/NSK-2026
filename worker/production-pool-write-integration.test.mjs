import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./production-api-v42-reference.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const workerConfig = readFileSync(new URL('../wrangler.api.production.toml', import.meta.url), 'utf8');
const client = readFileSync(new URL('../db.js', import.meta.url), 'utf8');

test('production pool write routes use the personal guard when the rollout flag is enabled', () => {
  assert.match(source, /import \{ authorizePersonalPoolWrite \} from '\.\/production-pool-write-authorization\.js'/);
  assert.match(source, /const personalPoolWritesEnabled = env\.NSK_REQUIRE_PERSONAL_POOL_WRITES === "true"/);
  assert.equal((source.match(/const access = await checkPersonalPoolWrite\(req\)/g) || []).length, 2,
    'both pool save/update and finish/reopen routes must run the guard');
  assert.match(source, /else if \(!env\.ADMIN_KV \|\| !await session\(req, env\)\)/);
});

test('client and Worker pool-write switches are jointly enabled', () => {
  assert.match(config, /REQUIRE_PERSONAL_POOL_WRITES: true/);
  assert.match(workerConfig, /NSK_REQUIRE_PERSONAL_POOL_WRITES = "true"/);
});

test('client sends the personal token only for pool writes after explicit opt-in', () => {
  assert.match(client, /REQUIRE_PERSONAL_POOL_WRITES === true/);
  assert.match(client, /window\.Auth\?\.getToken\?\.\(\)/);
  assert.ok(client.includes("personalWrite ? personalToken : localStorage.getItem('nsk_admin_token')"));
  assert.match(client, /Personlig inloggning krävs för att ändra poolspel/);
});
