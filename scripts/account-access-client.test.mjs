import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../account-access.js',import.meta.url),'utf8');
const destinationSource=source.slice(source.indexOf(' function destination()'),source.indexOf(" if($('loginForm'))"));
test('post-login navigation permits all app pages and rejects external or unrecognized destinations',()=>{
 const origin='https://zprcsv92cy-cmyk.github.io',fallback=origin+'/NSK-2026/startsida/';
 for(const next of ['/NSK-2026/traningsgrupper/?date=2026-11-11','/NSK-2026/ovningsarkiv/','/NSK-2026/ritverktyg/','/NSK-2026/anvandare/']){
  const location={origin,href:origin+'/NSK-2026/login/',search:'?next='+encodeURIComponent(next)};
  assert.equal(Function('location','URL','URLSearchParams',destinationSource+'return destination();')(location,URL,URLSearchParams),origin+next);
 }
 for(const next of ['https://evil.test/','//evil.test/','/NSK-2026/login/','/elsewhere/','/NSK-2026/startsida/\\evil']){
  const location={origin,href:origin+'/NSK-2026/login/',search:'?next='+encodeURIComponent(next)};
  assert.equal(Function('location','URL','URLSearchParams',destinationSource+'return destination();')(location,URL,URLSearchParams),fallback);
 }
});
test('public account pages contain no administrator bootstrap SQL and package versioned assets',()=>{
 const activation=readFileSync(new URL('../aktivera/index.html',import.meta.url),'utf8');
 assert.doesNotMatch(activation,/setupSql|generateCode|INSERT INTO|Cloudflare D1/);
 assert.match(activation,/name="referrer" content="no-referrer"/);
 assert.match(source,/history\.replaceState/);
 const workflow=readFileSync(new URL('../.github/workflows/publish-web-app.yml',import.meta.url),'utf8');
 assert.match(workflow,/cp -a account-access\.js account-users\.js/);
});
