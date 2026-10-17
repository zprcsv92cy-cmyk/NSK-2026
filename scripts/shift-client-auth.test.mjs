import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../db.js', import.meta.url), 'utf8');
function client({ session, requests }) {
  const window = { APP_CONFIG: { API_URL: 'https://api.test' }, Auth: { getToken: () => session } };
  const context = {
    window,
    localStorage: { getItem: key => key === 'nsk_admin_token' ? 'legacy-admin' : null },
    fetch: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ ok: true, count: 1, verified: true }) };
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
