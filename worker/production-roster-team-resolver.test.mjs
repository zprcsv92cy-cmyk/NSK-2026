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
