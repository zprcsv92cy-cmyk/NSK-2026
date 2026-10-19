import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./production-api-v42-reference.js', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const workerConfig = readFileSync(new URL('../wrangler.api.production.toml', import.meta.url), 'utf8');
const client = readFileSync(new URL('../db.js', import.meta.url), 'utf8');

test('match configuration and lineup writes invoke the personal guard behind a feature flag', () => {
  assert.match(source, /import \{ authorizePersonalMatchWrite \} from '\.\/production-match-write-authorization\.js'/);
  assert.match(source, /const personalMatchWritesEnabled = env\.NSK_REQUIRE_PERSONAL_MATCH_WRITES === "true"/);
  assert.match(source, /const access = await checkPersonalMatchWrite\(req\)/);
  assert.match(source, /readMatchConfig: configId => readRow\("matchkonfiguration", configId\)/);
  assert.match(source, /else if \(!env\.ADMIN_KV \|\| !await session\(req, env\)\)/);
});

test('match-write client and Worker rollout switches remain off until jointly enabled', () => {
  assert.match(config, /REQUIRE_PERSONAL_MATCH_WRITES: false/);
  assert.match(workerConfig, /NSK_REQUIRE_PERSONAL_MATCH_WRITES = "false"/);
  assert.match(client, /REQUIRE_PERSONAL_MATCH_WRITES === true/);
  assert.ok(client.includes("personalWrite ? personalToken : localStorage.getItem('nsk_admin_token')"));
});

test('client only selects personal match token for match configuration and lineup write routes', () => {
  assert.match(client, /personalMatchWrite = window\.APP_CONFIG/);
  assert.ok(client.includes('matchkonfiguration'));
  assert.ok(client.includes('laguppstallningar'));
  assert.match(client, /Personlig inloggning krävs för match och laguppställning/);
});
