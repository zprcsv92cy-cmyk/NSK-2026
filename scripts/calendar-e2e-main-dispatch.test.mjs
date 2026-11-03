import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');

test('isolated Worker deployment permits positive calendar E2E from reviewed main only',()=>{
 const yaml=read('.github/workflows/deploy-isolated-worker.yml');
 assert.match(yaml,/workflow_dispatch:/);
 assert.match(yaml,/inputs\.confirmation == 'ISOLATED_ONLY'/);
 assert.match(yaml,/!inputs\.positive_calendar_e2e \|\| github\.ref == 'refs\/heads\/main'/);
 assert.match(yaml,/environment: isolated-preview/);
 assert.match(yaml,/wrangler\.api\.isolated-worker\.toml/);
 assert.doesNotMatch(yaml,/wrangler\.api\.production\.toml/);
 assert.match(yaml,/NSK_E2E_EXPECTED_VERSION=\$version/);
 assert.match(yaml,/node scripts\/calendar-isolated-positive-e2e\.mjs/);
});

test('standalone positive E2E is manually confirmed and pinned to isolated Worker version',()=>{
 const yaml=read('.github/workflows/calendar-isolated-positive-e2e.yml');
 assert.match(yaml,/inputs\.confirmation == 'ISOLATED_CALENDAR_E2E' && github\.ref == 'refs\/heads\/main'/);
 assert.match(yaml,/environment: isolated-preview/);
 assert.match(yaml,/NSK_E2E_EXPECTED_VERSION: \$\{\{ inputs\.expected_version \}\}/);
 const script=read('scripts/calendar-isolated-positive-e2e.mjs');
 assert.match(script,/assert\.equal\(active,expectedVersion/);
 assert.match(script,/assert\.equal\(binding\('BASEROW_DATABASE_ID'\)\?\.text,'599495'\)/);
 assert.match(script,/assert\.equal\(binding\('NSK_ISOLATED_MODE'\)\?\.text,'true'\)/);
});
