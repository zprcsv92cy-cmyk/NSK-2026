import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveLegacyRosterTeam } from './production-roster-team-resolver.js';

const teams = [{ id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }, { id: 2, Namn: 'Testlag 2', 'Säsong': '2026' }];
const req = (path, method) => new Request('https://nsk.example' + path, { method });
const dependencies = { listTeams: async () => teams, readRow: async () => ({ Lag: [{ id: 18 }] }) };

test('POST resolves team from server-owned mapping, not browser query', async () => {
  assert.equal(await resolveLegacyRosterTeam(req('/api/spelare?team_id=2', 'POST'), dependencies), '18');
});
test('PATCH resolves persisted player team', async () => {
  assert.equal(await resolveLegacyRosterTeam(req('/api/spelare/41', 'PATCH'), dependencies), '18');
});
test('PATCH resolves persisted coach team', async () => {
  assert.equal(await resolveLegacyRosterTeam(req('/api/tranare/5', 'PATCH'), dependencies), '18');
});
test('cross-team row is rejected', async () => {
  await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare/41', 'PATCH'), {
    ...dependencies, readRow: async () => ({ Lag: [2] })
  }), /another team/);
});
test('missing persisted row is rejected', async () => {
  await assert.rejects(resolveLegacyRosterTeam(req('/api/tranare/5', 'PATCH'), {
    ...dependencies, readRow: async () => null
  }), /missing/);
});
test('team lookup outage is rejected', async () => {
  await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare', 'POST'), {
    ...dependencies, listTeams: async () => { throw Error('outage'); }
  }), /outage/);
});
test('unknown team mapping is rejected', async () => {
  await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare', 'POST'), {
    ...dependencies, listTeams: async () => []
  }), /missing/);
});
test('unsupported methods and route shapes are rejected', async () => {
  for (const request of [req('/api/spelare', 'GET'), req('/api/spelare/4', 'POST'), req('/api/tranare', 'PATCH')]) {
    await assert.rejects(resolveLegacyRosterTeam(request, dependencies), /Unsupported/);
  }
});

test('rejects attempts to change persisted team via PATCH body', async () => {
  for (const payload of [
    { team_id: 2 },
    { teamId: 2 },
    { Lag: [{ id: 2 }] },
    { Lag: [{ id: 18 }, { id: 2 }] },
    { Lag: '18' }
  ]) {
    const request = new Request('https://nsk.example/api/spelare/41', {
      method: 'PATCH', body: JSON.stringify(payload)
    });
    await assert.rejects(resolveLegacyRosterTeam(request, dependencies), /Conflicting/, JSON.stringify(payload));
    assert.equal(request.bodyUsed, false);
  }
});

test('accepts matching persisted team link without consuming original body', async () => {
  const request = new Request('https://nsk.example/api/spelare/41', {
    method: 'PATCH', body: JSON.stringify({ Lag: [{ id: 18 }], Namn: 'TEST' })
  });
  assert.equal(await resolveLegacyRosterTeam(request, dependencies), '18');
  assert.equal(request.bodyUsed, false);
});
