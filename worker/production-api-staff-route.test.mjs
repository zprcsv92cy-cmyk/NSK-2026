import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
const source = readFileSync('worker/production-api-v42-reference.js', 'utf8');

test('API reference routes staff writes through personal authorization', () => {
  assert.match(source, /import \{ handlePersonalLagpersonalWrite \} from '\.\/production-lagpersonal-write-handler\.js'/);
  assert.match(source, /url\.pathname === "\/api\/lagpersonal" && \["POST", "PATCH"\]\.includes\(req\.method\)/);
  assert.match(source, /await handlePersonalLagpersonalWrite\(req, env,/);
  assert.match(source, /return reply\(result, result\.status \|\| 500\)/);
});
test('trusted team lookup fails closed on incomplete Baserow pages', () => {
  assert.match(source, /if \(!response\.ok\) throw Error\("Trusted team list unavailable"\)/);
  assert.match(source, /!Array\.isArray\(data\.results\) \|\| data\.next/);
  assert.match(source, /if \(!env\.BASEROW_TOKEN \|\| !env\.BASEROW_DATABASE_ID\)/);
});
test('API reference retains explicit GET staff route and non-GET deny', () => {
  assert.match(source, /if \(req\.method !== "GET"\) return reply/);
  assert.match(source, /url\.pathname === "\/api\/lagpersonal" && req\.method === "GET"/);
  assert.doesNotMatch(source, /Personlig behörighetskontroll är ännu inte aktiverad/);
});
