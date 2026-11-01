import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../db.js', import.meta.url), 'utf8');
function client({ session, requests, shiftRows = null, pendingRetime = 0, failure = null }) {
  const window = { APP_CONFIG: { API_URL: 'https://api.test' }, Auth: { getToken: () => session, getSession: () => session ? { user: { id: 'test-user' } } : null }, prompt: () => { throw new Error('Legacy match-code prompt must not appear'); } };
  const context = {
    window,
    localStorage: { getItem: key => key === 'nsk_admin_token' ? 'legacy-admin' : null },
    fetch: async (url, init) => {
      requests.push({ url, init });
      if(failure){const next=failure;failure=null;if(next instanceof Error)throw next;return next;}
      if(init?.method==='PATCH'&&pendingRetime-->0)return {ok:false,status:409,json:async()=>({ok:false,pending_retime:true})};
      return { ok: true, status: 200, json: async () => url.includes('/api/lag?') ? ({ ok: true, results: [{ id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }], next: null }) : url.includes('/api/bytesschema?') ? ({ ok: true, results: shiftRows ?? [], next: null }) : ({ ok: true, count: 1, verified: true }) };
    },
    console, setTimeout, clearTimeout
  };
  vm.runInNewContext(source, context);
  return window.DB;
}
test('saving shifts sends personal Bearer token when logged in', async () => {
  const requests = [];
  await client({ session: 'personal-session', requests }).saveShiftSchema(1, 1, 1, [{period_no:1,time_left:'10:00',players:[1]}]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer personal-session');
  assert.equal(requests[0].init.method, 'POST');
});
test('missing personal login rejects shift save despite cached administrator token', async () => {
  const requests = [];
  await assert.rejects(client({session:null,requests}).saveShiftSchema(1,1,1,[{period_no:1,time_left:'10:00',players:[1]}]),/Personlig inloggning/);
  assert.equal(requests.length,0);
});

test('marking a shift complete uses personal session and never prompts for match code', async () => {
  const requests = [];
  const shiftRows = [{ id: 12, Poolspel: [1], Lagnummer: 1, Matchnummer: 1, Bytenummer: 1, Periodnummer: 1, 'Tid kvar': '10:00', 'Spelare på plan': [1], Genomfört: false }];
  await client({ session: 'personal-session', requests, shiftRows }).setShiftDone(1, 1, 1, 1, true);
  const update = requests.find(x => x.init?.method === 'PATCH');
  assert.ok(update);
  assert.match(update.url, /\/api\/bytesschema\/12\/done$/);
  assert.equal(update.init.headers.Authorization, 'Bearer personal-session');
  assert.equal(JSON.parse(update.init.body).done, true);
});

test('missing personal session rejects shift completion without prompting or using cached tokens', async () => {
 const requests=[];
 await assert.rejects(client({session:null,requests}).setShiftDone(1,1,1,1,true,42),/Personlig inloggning/);
 assert.equal(requests.length,0);
});

test('known shift id saves directly without fetching collections', async()=>{
 const requests=[];await client({session:'personal-session',requests}).setShiftDone(1,1,1,3,true,42);
 assert.equal(requests.length,1);assert.match(requests[0].url,/\/42\/done$/);assert.equal(requests[0].init.method,'PATCH');
});

test('shift check continues server recovery batches before reporting success',async()=>{const requests=[];await client({session:'personal-session',requests,pendingRetime:2}).setShiftDone(1,1,1,3,true,42);assert.equal(requests.length,3);assert(requests.every(r=>r.init.headers.Authorization==='Bearer personal-session'&&JSON.parse(r.init.body).done===true));});

test('network interruption is not automatically replayed and does not block the next explicit save',async()=>{
 const requests=[],db=client({session:'personal-session',requests,failure:new Error('Connection lost')});
 const shifts=[{period_no:1,time_left:'10:00',players:[1]}];
 await assert.rejects(db.saveShiftSchema(1,1,1,shifts),/Connection lost/);
 assert.equal(requests.length,1);
 await db.saveShiftSchema(1,1,1,shifts);
 assert.equal(requests.length,2);
});
test('authorization failure with a misleading recovery flag cannot trigger repeated writes',async()=>{
 const requests=[],failure={ok:false,status:401,json:async()=>({ok:false,pending_retime:true,error:'Session expired'})};
 await assert.rejects(client({session:'personal-session',requests,failure}).setShiftDone(1,1,1,1,true,42),/Session expired/);
 assert.equal(requests.length,1);
});

test('unchecking sends explicit false using the known row identity',async()=>{
 const requests=[];await client({session:'personal-session',requests}).setShiftDone(1,1,3,1,false,42);
 assert.equal(requests.length,1);assert.equal(JSON.parse(requests[0].init.body).done,false);assert.match(requests[0].url,/\/42\/done$/);
});

test('a confirmed toggle invalidates an earlier read in the same snapshot',async()=>{
 const requests=[],db=client({session:'personal-session',requests});
 await db.withReadSnapshot(async()=>{await db.listShiftSchema(1,1,1);await db.setShiftDone(1,1,1,1,false,42);await db.listShiftSchema(1,1,1);});
 assert.equal(requests.filter(r=>r.url.includes('/api/bytesschema?')).length,2);
});
