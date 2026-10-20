import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../admin-mode.js',import.meta.url),'utf8');
const config=readFileSync(new URL('../config.js',import.meta.url),'utf8');
function launch(personal){
  const links=[];
  const removed=[];
  const menu={querySelector:()=>null,append:node=>links.push(node)};
  const doc={readyState:'complete',head:{append:()=>{}},querySelector:s=>s==='.mainmenu'?menu:null,
    createElement:kind=>({tagName:kind,style:{},set textContent(x){this.text=x},set href(x){this.destination=x}})};
  const sandbox={window:{APP_CONFIG:personal?{REQUIRE_PERSONAL_POOL_WRITES:true,REQUIRE_PERSONAL_MATCH_WRITES:true,REQUIRE_PERSONAL_ROSTER_WRITES:true,REQUIRE_PERSONAL_COACH_SELECTION:true}:{}},
    document:doc,localStorage:{getItem:()=>null,removeItem:key=>removed.push(key)},fetch:async()=>{throw Error('unexpected network call')},console};
  vm.runInNewContext(source,sandbox);
  links.removed=removed;
  return links;
}
test('full personal cutover replaces shared Adminläge control with Mitt konto',()=>{
  assert.match(config,/REQUIRE_PERSONAL_COACH_SELECTION: true/);
  const links=launch(true);
  assert.equal(links.length,1);
  assert.equal(links[0].destination,'../mittkonto/');
  assert.equal(links[0].text,'Mitt konto');
  assert.deepEqual(links.removed,['nsk_admin_token','nsk_match_token']);
});
test('partial cutover must not silently hide legacy admin UI',()=>{
  assert.match(source,/personalCutoverEnabled/);
  assert.match(source,/if \(personalCutoverEnabled\)/);
  assert.match(source,/\/api\/admin\/login/);
  assert.match(source,/\/api\/admin\/status/);
});
