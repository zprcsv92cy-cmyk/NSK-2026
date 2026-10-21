import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const dbSource = readFileSync(new URL('../db.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../truppen/index.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('../config.js', import.meta.url), 'utf8');
const token = 'p'.repeat(43);

async function exercise({ enabled, authenticated = true, activeTeam = 'NSK Team 18', path, method = 'POST' }) {
  const requests = [];
  const sandbox = {
    window: {
      APP_CONFIG: { API_URL: 'https://api.example.invalid', REQUIRE_PERSONAL_ROSTER_WRITES: enabled },
      Auth: { getToken: () => authenticated ? token : null, activeTeam: () => activeTeam }
    },
    localStorage: { getItem: key => key === 'nsk_admin_token' ? 'legacy-admin' : null },
    fetch: async (url, options) => {
      requests.push({url,options});
      return {ok:true,json:async()=>({ok:true,row:{id:1}})};
    },
    URL, console
  };
  vm.runInNewContext(dbSource, sandbox);
  let error;
  try {
    if (path === '/api/spelare') await sandbox.window.DB.addPlayer('Tester');
    else if (path === '/api/tranare') await sandbox.window.DB.addCoach('Coach');
    else if (path.startsWith('/api/spelare/')) await sandbox.window.DB.updatePlayer(1, 'Tester 2');
    else if (path.startsWith('/api/tranare/')) await sandbox.window.DB.updateCoach(1, 'Coach 2');
  } catch (e) { error=e; }
  return {requests,error};
}

test('opt-in roster writes choose a personal bearer token, never the shared admin token', async () => {
  for(const path of ['/api/spelare','/api/tranare','/api/spelare/1','/api/tranare/1']) {
    const x=await exercise({enabled:true,path});
    assert.equal(x.error, undefined, path);
    assert.equal(x.requests.length,1,path);
    assert.equal(x.requests[0].options.headers.Authorization, 'Bearer '+token,path);
  }
});

test('missing personal login does not fall back to Adminläge', async () => {
  const x=await exercise({enabled:true,authenticated:false,path:'/api/spelare'});
  assert.match(x.error.message,/Personlig inloggning krävs/);
  assert.equal(x.requests.length,0);
});

test('existing admin requests remain unchanged while rollout disabled', async () => {
  const x=await exercise({enabled:false,path:'/api/spelare'});
  assert.equal(x.requests.length,1);
  assert.equal(x.requests[0].options.headers.Authorization,'Bearer legacy-admin');
});

test('roster page switches permission checks with server verification and limits to mapped team', () => {
  assert.match(page,/REQUIRE_PERSONAL_ROSTER_WRITES === true/);
  assert.match(page,/team !== 'NSK Team 18'/);
  assert.match(page,/Auth\.checkTeamFeature\('roster', team\)/);
  assert.match(page,/const allowed=await window\.NSKRosterCanEdit\(\)/);
  assert.match(page,/const verified=await window\.NSKRosterCanEdit\(\)/);
  assert.match(config,/REQUIRE_PERSONAL_ROSTER_WRITES: false/);
});


test('personal player and coach writes deny any other active team before network access', async () => {
  for (const path of ['/api/spelare', '/api/tranare', '/api/spelare/1', '/api/tranare/1']) {
    const result = await exercise({ enabled: true, activeTeam: 'NSK Testlag 2', path });
    assert.match(result.error?.message || '', /Välj NSK Team 18/, path);
    assert.equal(result.requests.length, 0, path);
  }
});

test('personal roster writes deny missing active team rather than falling back to legacy admin', async () => {
  const result = await exercise({ enabled: true, activeTeam: null, path: '/api/spelare' });
  assert.match(result.error?.message || '', /Välj NSK Team 18/);
  assert.equal(result.requests.length, 0);
});
