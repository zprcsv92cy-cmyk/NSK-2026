import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveLagpersonalKvOwnership } from './lagpersonal-kv-ownership.js';
const id = '123e4567-e89b-12d3-a456-426614174000';
const teams = [{ id: 18 }, { id: 2 }];
const make = (method, team, body = { id, role: 'Lagledare', name: 'Test' }) =>
  new Request('https://example.test/api/lagpersonal?team_id=' + team, {
    method, ...(method === 'PATCH' ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {})
  });
const sources = { listTeams: async () => teams, readTeamStaff: async () => [{ id, role: 'Lagledare', name: 'Old' }] };
test('POST validates team without staff lookup', async () => {
  assert.equal(await resolveLagpersonalKvOwnership(make('POST', 18), sources), '18');
});
test('PATCH reads ID and role from JSON body, not query', async () => {
  assert.equal(await resolveLagpersonalKvOwnership(make('PATCH', 18), sources), '18');
});
test('PATCH preserves request body for subsequent mutation', async () => {
  const req = make('PATCH', 18);
  await resolveLagpersonalKvOwnership(req, sources);
  assert.equal((await req.json()).id, id);
});
test('PATCH refuses staff ID not stored in selected team KV', async () => {
  await assert.rejects(resolveLagpersonalKvOwnership(make('PATCH', 18), {
    ...sources, readTeamStaff: async () => []
  }));
});
test('PATCH refuses wrong role even with matching ID', async () => {
  await assert.rejects(resolveLagpersonalKvOwnership(make('PATCH', 18, { id, role: 'Fysansvarig' }), sources));
});
test('PATCH refuses unknown team', async () => {
  await assert.rejects(resolveLagpersonalKvOwnership(make('PATCH', 999), sources));
});
test('PATCH fails closed when KV is unavailable', async () => {
  await assert.rejects(resolveLagpersonalKvOwnership(make('PATCH', 18), {
    ...sources, readTeamStaff: async () => { throw Error('KV offline'); }
  }));
});
test('PATCH fails closed when body ID is missing', async () => {
  await assert.rejects(resolveLagpersonalKvOwnership(make('PATCH', 18, { role: 'Lagledare' }), sources));
});
