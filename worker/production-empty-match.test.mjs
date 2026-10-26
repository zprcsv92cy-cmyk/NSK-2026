import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from './production-api-v42-reference.js';

test('empty match survives create, reload and repeated save through app, adapter and Worker', async () => {
  const team = { id: 1, Namn: 'NSK Team 18', 'Säsong': '2026' };
  const pool = { id: 3, Lag: [{ id: 1 }], 'Antal lag': 1, 'Antal matcher': 8 };
  let saved = null, grants = ['match:manage', 'lineup:edit'], membership = 'NSK Team 18';
  let active = true, creates = 0, writes = 0;
  const db = { prepare(sql) { return { bind() { return {
    first: async () => active ? { id: 'fixture', display_name: 'Fixture', is_global_admin: 0 } : null,
    all: async () => ({ results: sql.includes('auth_team_memberships')
      ? [{ team_id: membership, role: 'team_admin' }] : grants.map(permission => ({ permission })) })
  }; } }; } };
  const env = { AUTH_DB: db, BASEROW_TOKEN: 'fixture', BASEROW_DATABASE_ID: '589073', NSK_REQUIRE_PERSONAL_MATCH_WRITES: 'true' };
  const empty = { pool_id: 3, lag_no: 1, match_no: 8, start_time: '10:00', opponent: 'Fixture', plan: 'Plan 1',
    player_count: null, goalie_player_id: null, players_on_field: [] };
  const request = (body = empty, method = 'POST', path = '/api/matchkonfiguration', token = 'a'.repeat(43)) =>
    new Request('https://fixture.test' + path, { method, headers: { 'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    assert.equal(new URL(url).origin, 'https://api.baserow.io', 'no live network allowed');
    const path = new URL(url).pathname.split('/table/')[1].replace(/\/$/, '');
    const method = init.method || 'GET';
    if (method !== 'GET') {
      assert.ok(path === '1255157' || path === '1255157/99', method + ' ' + path);
      writes++;
      if (method === 'POST') creates++;
      saved = { id: 99, ...JSON.parse(init.body) };
      return Response.json(saved, { status: method === 'POST' ? 201 : 200 });
    }
    if (path === '1255083') return Response.json({ results: [team], next: null });
    if (path === '1255101/3') return Response.json(pool);
    if (path === '1255157/99') return Response.json(saved);
    if (path === '1255098') return Response.json({ results: [7, 8].map(id => ({ id, Lag: [{ id: 1 }] })), next: null });
    if (path === '1255100' || path === '1255113') return Response.json({ results: [], next: null });
    throw Error('Unexpected upstream ' + method + ' ' + path);
  };
  const window = { APP_CONFIG: { API_URL: 'https://fixture.test', REQUIRE_PERSONAL_MATCH_WRITES: true },
    Auth: { getToken: () => 'a'.repeat(43) } };
  const context = vm.createContext({ window, localStorage: { getItem: () => null },
    fetch: async (url, init = {}) => {
      if (init.method) return worker.fetch(new Request(url, init), env);
      const table = new URL(url).pathname.split('/').pop();
      return Response.json({ ok: true, results: table === 'lag' ? [team] : table === 'matchkonfiguration' && saved ? [saved] : [], next: null });
    } });
  vm.runInContext(readFileSync(new URL('../db.js', import.meta.url), 'utf8'), context);
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('  async function saveLaguppstallningMatchConfigInternal(');
  const end = app.indexOf('  async function initLaguppstallningPage()', start);
  const messages = [];
  Object.assign(context, { DB: window.DB, sessionStorage: { getItem: key => key === 'nsk2_pool_id' ? '3' : '1' },
    byId: () => ({ value: '8' }), setText: (id, value) => messages.push([id, value]),
    validateUniquePlayersPerMatch: async () => '' });
  vm.runInContext(app.slice(start, end) + '\nthis.saveMatch = saveLaguppstallningMatchConfigInternal;', context);
  const snapshot = { poolId: '3', lagNo: '1', matchNo: '8', goalie: '', playerCount: 3, players: ['', '', ''],
    coachIds: [], startTime: '10:00', opponent: 'Fixture', plan: 'Plan 1' };
  try {
    await context.saveMatch(false, snapshot);
    assert.equal(creates, 1, JSON.stringify(messages));
    assert.equal(saved['Antal spelare'], null);
    assert.deepEqual(saved.Målvakt, []);
    assert.deepEqual(saved['Spelare på plan'], []);
    assert.ok(messages.some(([, value]) => value.includes('sparad för Match 8')));
    const reread = await window.DB.getPoolTeamMatchConfig(3, 1, 8);
    assert.equal(reread.id, 99);
    assert.equal(reread.goalie_player_id, null);
    assert.equal(reread.players_on_field.length, 0);
    await context.saveMatch(false, snapshot);
    assert.equal(creates, 1, 'repeat save must PATCH the persisted match');
    assert.equal(writes, 2);
    for (const patch of [ { players_on_field: [999] }, { goalie_player_id: 7 }, { player_count: 3 },
      { player_count: 0 }, { goalie_player_id: '' }, { players_on_field: null } ]) {
      const r = await worker.fetch(request({ ...empty, ...patch }), env);
      assert.equal(r.status, 400, JSON.stringify(patch));
    }
    let r = await worker.fetch(request({ ...empty, player_count: 1, goalie_player_id: 7, players_on_field: [999, 7] }), env);
    assert.equal(r.status, 403, 'foreign player remains denied');
    r = await worker.fetch(request(empty, 'POST', '/api/matchkonfiguration', null), env);
    assert.equal(r.status, 401);
    active = false;
    r = await worker.fetch(request(), env); assert.equal(r.status, 401);
    active = true; grants = [];
    r = await worker.fetch(request(), env); assert.equal(r.status, 403);
    grants = ['match:manage', 'lineup:edit']; membership = 'Other team';
    r = await worker.fetch(request(), env); assert.equal(r.status, 403);
    assert.equal(writes, 2, 'rejected requests must never write');
    membership = 'NSK Team 18';
    const filled = { ...empty, player_count: 1, goalie_player_id: 7, players_on_field: [7, 8] };
    r = await worker.fetch(request(filled, 'PATCH', '/api/matchkonfiguration/99'), env);
    assert.equal(r.status, 200);
    assert.deepEqual(saved.Målvakt, [7]);
    assert.deepEqual(saved['Spelare på plan'], [7, 8]);
    const legacy = { ...env, NSK_REQUIRE_PERSONAL_MATCH_WRITES: 'false', ADMIN_KV: { get: async () => 'fixture-session' } };
    r = await worker.fetch(request(empty, 'PATCH', '/api/matchkonfiguration/99', 'b'.repeat(64)), legacy);
    assert.equal(r.status, 200, 'existing Adminläge path supports empty matches');
    assert.deepEqual(saved.Målvakt, []);
    assert.deepEqual(saved['Spelare på plan'], []);
    const beforeDenied = writes;
    r = await worker.fetch(request(empty, 'PATCH', '/api/matchkonfiguration/99', 'b'.repeat(64)),
      { ...legacy, ADMIN_KV: { get: async () => null } });
    assert.equal(r.status, 401);
    r = await worker.fetch(request({ ...empty, pool_id: 4 }, 'PATCH', '/api/matchkonfiguration/99'), env);
    assert.equal(r.status, 403);
    assert.equal(writes, beforeDenied);
  } finally { globalThis.fetch = oldFetch; }
});

test('opening a saved empty match inherits the populated Match 1 lineup', async () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const start = app.indexOf('  async function fillLaguppstallningFormFromSelection()');
  const end = app.indexOf('  async function validateUniquePlayersPerMatch(', start);
  const controls = new Map();
  const byId = id => {
    if (!controls.has(id)) controls.set(id, { value: id === 'lineupMatch' ? '2' : id === 'lineupPlayerCount' ? '3' :
      id === 'lineupGoalie' || /^lineupPlayer\d+$/.test(id) ? 'stale' : '',
      dataset: {}, options: [], dispatchEvent() {} });
    return controls.get(id);
  };
  let copied = false;
  const context = vm.createContext({ window: {}, clearTimeout() {}, Event: class {}, byId,
    sessionStorage: { getItem: key => ({ nsk2_pool_id: '3', nsk2_lag_nr: '1' })[key] || null },
    DB: {
      getPoolTeamMatchConfig: async (pool, team, match) => String(match) === '2'
        ? { id: 99, player_count: 0, goalie_player_id: null, players_on_field: [] }
        : { id: 98, player_count: 3, goalie_player_id: 7, players_on_field: [7, 8, 9, 10] },
      getLineup: async id => { if (id === 98) { copied = true; return [8, 9, 10].map((person_id, i) =>
        ({ id: i + 1, person_type: 'player', person_id, sort_order: i + 1 })); } return []; }
    },
    renderCoachOptions: async () => {}, renderLineupSelectors: async () => {},
    setText() {}, updateVisiblePlayers() {}, setActiveMatchButton() {},
    cleanUUID: value => value == null ? '' : String(value), safeInt: (value, fallback) => Number.parseInt(value, 10) || fallback,
    syncGoalieAgainstPlayers() {}, syncSelectedPlayersAcrossLineup() {},
    loadCoachSelectionFromKV: async () => {}, updateCoachEnabledState() {}
  });
  vm.runInContext(app.slice(start, end) + '\nthis.openMatch = fillLaguppstallningFormFromSelection;', context);
  await context.openMatch();
  assert.equal(copied, true);
  assert.equal(byId('lineupGoalie').value, '7');
  for (let i = 1; i <= 25; i++) assert.equal(byId('lineupPlayer' + i).value, i<=3?String(i+7):'');
});
