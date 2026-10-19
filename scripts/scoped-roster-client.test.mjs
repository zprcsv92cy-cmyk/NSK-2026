import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../db.js', import.meta.url), 'utf8');
const token = 'x'.repeat(43);
async function exercise(enabled, authenticated) {
  const requests = [];
  const sandbox = {
    window: { APP_CONFIG: { API_URL: 'https://api.invalid', REQUIRE_SCOPED_ROSTER_READS: enabled },
      Auth: { getToken: () => authenticated ? token : null, activeTeam: () => 'NSK Team 18' } },
    fetch: async (url, options) => {
      requests.push({url, options});
      if (url.includes('/api/lag?')) return {ok:true,json:async()=>({ok:true,results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}],next:null})};
      return {ok:true,json:async()=>({ok:true,results:[{id:1,Namn:'Player',Lag:[{id:18}]}],next:null})};
    },
    URL, console
  };
  vm.runInNewContext(source, sandbox);
  if (enabled && !authenticated) {
    await assert.rejects(() => sandbox.window.DB.listPlayers(), /Personlig inloggning/);
    assert.equal(requests.length, 0);
  } else {
    await sandbox.window.DB.listPlayers();
    const roster = requests.find(r => r.url.includes('/api/spelare?'));
    assert.ok(roster);
    assert.equal(roster.url.includes('team_id=18'), enabled);
    assert.equal(roster.options.headers.Authorization, enabled ? 'Bearer '+token : undefined);
  }
}
test('legacy roster reads remain unchanged while feature is off', async()=>exercise(false,false));
test('scoped roster reads send numeric team and bearer token', async()=>exercise(true,true));
test('scoped roster reads fail closed without login', async()=>exercise(true,false));

test('scoped roster rejects missing active team before roster fetch', async () => {
  const requests = [];
  const sandbox = {
    window: { APP_CONFIG: { API_URL: 'https://api.invalid', REQUIRE_SCOPED_ROSTER_READS: true },
      Auth: { getToken: () => token, activeTeam: () => null } },
    fetch: async (...args) => { requests.push(args); throw Error('unexpected request'); },
    URL, console
  };
  vm.runInNewContext(source, sandbox);
  await assert.rejects(() => sandbox.window.DB.listPlayers(), /Välj ett lag/);
  assert.equal(requests.length, 0);
});
