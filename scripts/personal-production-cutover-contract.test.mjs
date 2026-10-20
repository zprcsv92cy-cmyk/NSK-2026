import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const web=read('config.js'), worker=read('wrangler.api.production.toml');
const db=read('db.js'),api=read('worker/production-api-v42-reference.js');
const admin=read('admin-mode.js'),editor=read('pool-team-editor.js');
const features=['POOL_WRITES','MATCH_WRITES','COACH_SELECTION'];

test('candidate enables identical personal-write flags in web and API',()=>{
  for(const feature of features){
    assert.match(web,new RegExp('REQUIRE_PERSONAL_'+feature+': true'));
    assert.match(worker,new RegExp('NSK_REQUIRE_PERSONAL_'+feature+' = "true"'));
  }
  assert.match(web,/REQUIRE_PERSONAL_ROSTER_WRITES: true/);
  for(const feature of ['ROSTER_READS','TEAM_READS','COLLECTION_READS']){
    assert.match(worker,new RegExp('NSK_REQUIRE_SCOPED_'+feature+' = "true"'));
  }
});

test('frontend denies old admin and match-code fallbacks after complete cutover',()=>{
  assert.match(db,/const personalCutoverEnabled/);
  assert.match(db,/if\(personalCutoverEnabled\(\)\)throw new Error\('Personlig inloggning krävs för att spara bytesschema/);
  assert.match(db,/if\(personalCutoverEnabled\(\)\)throw new Error\('Personlig inloggning krävs för att checka byten/);
  assert.match(admin,/if \(personalCutoverEnabled\)/);
  assert.match(editor,/checkTeamFeature\?\.\('pool',team\)/);
});

test('release API disables issuing shared admin tokens',()=>{
  assert.match(api,/url\.pathname === "\/api\/admin\/login" && req\.method === "POST" &&/);
  assert.match(api,/personalPoolWritesEnabled && personalMatchWritesEnabled/);
  assert.match(api,/NSK_REQUIRE_PERSONAL_COACH_SELECTION === "true"/);
  assert.match(api,/Använd personlig inloggning/);
});

test('all pages that include old admin button load the new config first',()=>{
  const pages=['startsida','truppen','skapapoolspel','laguppstallning','bytesschema','matchvy','malvaktsstatistik','lag'];
  for(const page of pages){
    const html=read(page+'/index.html');
    const old=html.indexOf('admin-mode.js');
    const config=html.indexOf('config.js');
    assert.ok(old>=0,page+' must be evaluated');
    assert.ok(config>=0 && config<old,page+' must load config before admin-mode');
    assert.ok(html.includes('auth.js'),page+' needs personal auth client');
  }
});

test('release changes service-worker cache epoch so old admin assets are not silently reused',()=>{
  const version=read('version.js');
  const sw=read('sw.js');
  const number=/NSK_VERSION = "(\\d+)"/.exec(version)?.[1];
  assert.ok(number,'version.js must declare a version');
  assert.match(sw,new RegExp('CACHE_NAME = "nsk-team18-v'+number+'"'));
  assert.match(sw,/caches\.delete\(key\)/);
  assert.match(sw,/fetch\(req\)/);
  assert.match(sw,/url\.pathname\.endsWith\("\/deploy\.json"\)/);
});
