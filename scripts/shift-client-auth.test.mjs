import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../db.js', import.meta.url), 'utf8');
function client({ session, requests, shiftRows = null }) {
  const window = { APP_CONFIG: { API_URL: 'https://api.test' }, Auth: { getToken: () => session, getSession: () => session ? { user: { id: 'test-user' } } : null }, prompt: () => { throw new Error('Legacy match-code prompt must not appear'); } };
  const context = {
    window,
    localStorage: { getItem: key => key === 'nsk_admin_token' ? 'legacy-admin' : null },
    fetch: async (url, init) => {
      requests.push({ url, init });
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
test('legacy admin remains fallback only without personal login', async () => {
  const requests = [];
  await client({ session: null, requests }).saveShiftSchema(1, 1, 1, [{period_no:1,time_left:'10:00',players:[1]}]);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer legacy-admin');
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

test('stale token without verified session does not override legacy flow', async () => {
  const requests = [];
  const db = client({ session: null, requests });
  await db.saveShiftSchema(1, 1, 1, [{period_no:1,time_left:'10:00',players:[1]}]);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer legacy-admin');
});
