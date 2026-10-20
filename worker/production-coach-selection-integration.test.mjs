import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const worker=readFileSync(new URL('./production-api-v42-reference.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../db.js',import.meta.url),'utf8');
const config=readFileSync(new URL('../config.js',import.meta.url),'utf8');
const wrangler=readFileSync(new URL('../wrangler.api.production.toml',import.meta.url),'utf8');
test('coach selection is protected server-side only when enabled',()=>{
 assert.match(worker,/import \{ authorizeCoachSelection \} from '\.\/production-coach-selection-authorization\.js'/);
 assert.match(worker,/NSK_REQUIRE_PERSONAL_COACH_SELECTION === "true"/);
 assert.match(worker,/await authorizeCoachSelection\(req, env/);
 assert.match(worker,/else if \(!env\.ADMIN_KV \|\| !await session\(req, env\)\)/);
});
test('client switches read/write tokens together while both rollout flags are enabled in release candidate',()=>{
 assert.match(client,/personalCoachSelectionEnabled\(\)\?window\.Auth\?\.getToken/);
 assert.match(client,/if\(!personalCoachSelectionEnabled\(\)\)return adminRequest/);
 assert.match(config,/REQUIRE_PERSONAL_COACH_SELECTION: true/);
 assert.match(wrangler,/NSK_REQUIRE_PERSONAL_COACH_SELECTION = "true"/);
});
