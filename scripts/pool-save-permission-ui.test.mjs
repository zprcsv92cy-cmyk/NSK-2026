import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const page = readFileSync(new URL('../skapapoolspel/index.html', import.meta.url), 'utf8');

test('pool save button uses server-confirmed personal permission when rollout is enabled', () => {
  assert.match(page, /REQUIRE_PERSONAL_POOL_WRITES===true/);
  assert.match(page, /Auth\?\.checkTeamFeature\?\.\('pool',team\)/);
  assert.match(page, /if\(allowed\)/);
  assert.match(page, /Auth\?\.activeTeam\?\.\(\)/);
});

test('pool page never enables saving through shared administrator credentials', () => {
  assert.doesNotMatch(page, /nsk_admin_token/);
  assert.doesNotMatch(page, /\/api\/admin\/status/);
});


test('focus checks retain visible controls and save busy state but enforce revoked permissions',async()=>{
 const code=page.slice(page.indexOf('(function(){\n const btn='),page.lastIndexOf('</script>'));
 const button={hidden:true,disabled:true},events={};let resolve,calls=0;
 vm.runInNewContext(code,{document:{getElementById:()=>button},window:{APP_CONFIG:{REQUIRE_PERSONAL_POOL_WRITES:true},Auth:{getSession:()=>true,activeTeam:()=>18,checkTeamFeature:()=>{calls++;return new Promise(r=>resolve=r);}},addEventListener:(name,fn)=>events[name]=fn}});
 const settle=async allowed=>{resolve(allowed);await new Promise(setImmediate);};
 assert.equal(button.hidden,true);await settle(true);assert.equal(button.hidden,false);
 events.focus();events.focus();assert.equal(calls,2);assert.equal(button.hidden,false);await settle(true);
 button.disabled=true;events.focus();await settle(true);assert.equal(button.disabled,true);
 events.focus();await settle(false);assert.equal(button.hidden,true);assert.equal(button.disabled,true);
});
