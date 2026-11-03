import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('./calendar-isolated-positive-e2e.mjs',import.meta.url),'utf8');
test('isolated calendar E2E explains D1 token 403 without printing credential',()=>{
 assert.match(source,/response\.status===403/);
 assert.match(source,/requires D1 Write permission for the dedicated test database/);
 assert.match(source,/isolated-preview CLOUDFLARE_API_TOKEN/);
 assert.doesNotMatch(source,/console\.log\(cloudflareToken\)/);
});
