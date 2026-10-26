const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');
test('navigation retains key hockey features', () => {
 const html=read('startsida/index.html');
 for(const href of ['../ovningsarkiv/','../ritverktyg/','../traningsgrupper/','../anvandare/']) assert.ok(html.includes('href="'+href+'"'),href);
});
test('hockey exercise archive retains catalog and drawing preview',()=>{
 const html=read('ovningsarkiv/index.html');
 for(const script of ['hockeyakademin-catalog.js','exercise-archive.js']) assert.ok(html.includes(script),script);
 assert.ok(fs.existsSync('exercise-rink-preview.js'));
 assert.ok(fs.existsSync('rink-drawer.js'));
});
test('release label stays separate from internal update checks',()=>{
 const js=read('app.js');
 for(const marker of ['NSK_APP_VERSION','nskDisplayVersion()','deploy.json?ts=','cache: "no-store"']) assert.ok(js.includes(marker),marker);
});
test('release pipeline enforces stamped version consistency',()=>{
 const wf=read('.github/workflows/publish-web-app.yml');
 for(const marker of ['scripts/bump-version.cjs','Verify stamped release consistency','NSK_TARGET_VERSION:','github.run_id']) assert.ok(wf.includes(marker),marker);
});
test('offline service worker is network-first and excludes deploy manifest',()=>{
 const sw=read('sw.js');
 assert.ok(sw.includes('await fetch(req)'));
 assert.ok(sw.includes('url.pathname.endsWith("/deploy.json")'));
});
