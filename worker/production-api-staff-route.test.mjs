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
test('trusted team lookup paginates and fails closed on invalid or excessive pages', () => {
  assert.match(source, /if \(!response\.ok\) throw Error\("Trusted team list unavailable"\)/);
  assert.match(source, /for \(let page = 1; page <= 100; page\+\+\)/);
  assert.match(source, /if \(!Array\.isArray\(data\.results\)\) throw Error\("Invalid trusted team list"\)/);
  assert.match(source, /teams\.push\(\.\.\.data\.results\)/);
  assert.match(source, /if \(!data\.next\) return teams/);
  assert.match(source, /throw Error\("Trusted team list exceeded pagination limit"\)/);
  assert.match(source, /if \(!env\.BASEROW_TOKEN \|\| !env\.BASEROW_DATABASE_ID\)/);
});
test('API reference retains explicit GET staff route and non-GET deny', () => {
  assert.match(source, /if \(req\.method !== "GET"\) return reply/);
  assert.match(source, /url\.pathname === "\/api\/lagpersonal" && req\.method === "GET"/);
  assert.doesNotMatch(source, /Personlig behörighetskontroll är ännu inte aktiverad/);
});

test('shift routes parse Bearer tokens using real whitespace boundaries', () => {
  const expected = String.raw`const identityToken = /^Bearer ([^\s]+)$/`;
  assert.equal(source.split(expected).length - 1, 2, 'save and done routes must both use the correct Bearer token regex');
});


test('opt-in scoped roster handler precedes legacy reads and uses trusted sources', () => {
  assert.match(source, /env\.NSK_REQUIRE_SCOPED_ROSTER_READS === "true"/);
  assert.match(source, /req\.headers\.has\("Authorization"\)/);
  assert.match(source, /req\.method === "GET"/);
  assert.match(source, /spelare\|tranare\|lagpersonal/);
  assert.match(source, /createProductionRosterReadHandler\(env,/);
  assert.match(source, /const scopedResponse = await handler\(req\)/);
  assert.match(source, /for \(const \[name, value\] of Object\.entries\(cors\)\) scopedHeaders\.set\(name, value\)/);
  assert.match(source, /return new Response\(scopedResponse\.body, \{status: scopedResponse\.status, headers: scopedHeaders\}\)/);
  assert.match(source, /createProductionRosterReadHandler\(env, \{/);
  assert.match(source, /fetchAllRosterRows,/);
  assert.match(source, /fetchTeamStaff: async teamId/);
  assert.match(source, /listTrustedTeams,/);
  assert.match(source, /data\.results\.length > 200/);
  assert.match(source, /Incomplete roster page/);
  const gate = source.indexOf('if ((env.NSK_REQUIRE_SCOPED_ROSTER_READS === "true"');
  const legacyRead = source.indexOf('if (url.pathname === "/api/lagpersonal" && req.method === "GET")');
  assert.ok(gate >= 0 && legacyRead > gate, 'scoped handler must precede legacy roster read');
});
