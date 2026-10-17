import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveLegacyRosterTeam } from './production-roster-team-resolver.js';

const teams = [{ id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }, { id: 2, Namn: 'Testlag 2', 'Säsong': '2026' }];
const req = (path, method) => new Request('https://nsk.example' + path, { method });
const dependencies = { listTeams: async () => teams, readRow: async () => ({ Lag: [{ id: 18 }] }) };

test('POST resolves team from server-owned mapping', async () => {
  assert.equal(await resolveLegacyRosterTeam(req('/api/spelare?team_id=18', 'POST'), dependencies), '18');
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

test('DELETE resolves the persisted player or coach team, not the browser query', async () => {
  for (const path of ['/api/spelare/41?team_id=18', '/api/tranare/5?team_id=18']) {
    assert.equal(await resolveLegacyRosterTeam(req(path, 'DELETE'), dependencies), '18');
  }
});
test('DELETE rejects a row owned by another team or a missing row', async () => {
  for (const readRow of [async () => ({ Lag: [{ id: 2 }] }), async () => null]) {
    await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare/41', 'DELETE'), {
      ...dependencies, readRow
    }));
  }
});
test('DELETE collection route is rejected without reading or deleting rows', async () => {
  let reads = 0;
  await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare', 'DELETE'), {
    ...dependencies, readRow: async () => { reads++; return { Lag: [{ id: 18 }] }; }
  }), /Unsupported/);
  assert.equal(reads, 0);
});

test('rejects conflicting secondary team alias even when primary alias matches', async () => {
  for (const payload of [
    { team_id: 18, teamId: 2 },
    { team_id: null, teamId: 2 },
    { team_id: 18, teamId: null },
    { team_id: null },
    { teamId: null }
  ]) {
    const request = new Request('https://nsk.example/api/spelare/41', {
      method: 'PATCH', body: JSON.stringify(payload)
    });
    await assert.rejects(resolveLegacyRosterTeam(request, dependencies), /Conflicting/, JSON.stringify(payload));
    assert.equal(request.bodyUsed, false);
  }
});

test('rejects ambiguous or missing persisted team links before PATCH or DELETE', async () => {
  for (const links of [[], [18, 2], [{ id: 18 }, { id: 18 }], [{ id: 18 }, { id: 2 }]]) {
    for (const method of ['PATCH', 'DELETE']) {
      const request = req('/api/spelare/41', method);
      await assert.rejects(resolveLegacyRosterTeam(request, {
        ...dependencies, readRow: async () => ({ Lag: links })
      }), /another team/, method + ' ' + JSON.stringify(links));
    }
  }
});

test('rejects zero and unsafe roster row IDs before reading any row', async () => {
  for (const id of ['0', '9007199254740993', '999999999999999999999']) {
    for (const method of ['PATCH', 'DELETE']) {
      let reads = 0;
      await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare/' + id, method), {
        ...dependencies, readRow: async () => { reads++; return { Lag: [{ id: 18 }] }; }
      }), /Invalid roster row ID/, method + ' ' + id);
      assert.equal(reads, 0);
    }
  }
});

test('rejects duplicate trusted team mappings instead of selecting the first', async () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const path = method === 'POST' ? '/api/spelare' : '/api/spelare/41';
    let reads = 0;
    await assert.rejects(resolveLegacyRosterTeam(req(path, method), {
      ...dependencies,
      listTeams: async () => [
        { id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' },
        { id: 19, Namn: 'NSK Team 18', 'Säsong': '2026' }
      ],
      readRow: async () => { reads++; return { Lag: [{ id: 18 }] }; }
    }), /ambiguous/, method);
    assert.equal(reads, 0);
  }
});

test('rejects noncanonical trusted team IDs before reading roster rows', async () => {
  for (const id of ['18.0', '018', '1e1', ' 18', 18.5, null, '9007199254740993']) {
    let reads = 0;
    await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare/41', 'PATCH'), {
      ...dependencies,
      listTeams: async () => [{ id, Namn: 'NSK Team 18', 'Säsong': '2026' }],
      readRow: async () => { reads++; return { Lag: [{ id: 18 }] }; }
    }), /Trusted team missing/, String(id));
    assert.equal(reads, 0);
  }
});

test('accepts canonical numeric team IDs and rejects ambiguous team references', async () => {
  for (const id of [18, '18']) {
    assert.equal(await resolveLegacyRosterTeam(req('/api/spelare/41', 'DELETE'), {
      ...dependencies,
      listTeams: async () => [{ id, Namn: 'NSK Team 18', 'Säsong': '2026' }]
    }), '18');
  }
  for (const links of [[{ id: 18 }, { id: 2 }], [{ id: 18 }, { id: 18 }]]) {
    await assert.rejects(resolveLegacyRosterTeam(req('/api/tranare/5', 'DELETE'), {
      ...dependencies,
      readRow: async () => ({ Lag: links })
    }), /another team/);
  }
});


test('trusted auth team mapping uses membership key after verifying Baserow ownership', async () => {
  const team = await resolveLegacyRosterTeam(req('/api/spelare/41?team_id=18', 'PATCH'), {
    ...dependencies, authorizationTeamId: 'NSK Team 18'
  });
  assert.equal(team, 'NSK Team 18');
});

test('trusted auth team mapping rejects invalid keys and foreign persisted rows', async () => {
  await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare', 'POST'), {
    ...dependencies, authorizationTeamId: ''
  }), /Invalid trusted team mapping/);
  await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare/41', 'PATCH'), {
    ...dependencies, authorizationTeamId: 'NSK Team 18', readRow: async () => ({ Lag: [{ id: 2 }] })
  }), /another team/);
});


test('rejects foreign and duplicate query team selectors before reading rows', async () => {
  for (const query of ['team_id=2', 'teamId=2', 'team_id=18&team_id=18', 'team_id=18&teamId=2', 'team_id=', 'team_id=018']) {
    let reads = 0;
    await assert.rejects(resolveLegacyRosterTeam(req('/api/spelare/41?' + query, 'PATCH'), {
      ...dependencies, readRow: async () => { reads++; return { Lag: [{ id: 18 }] }; }
    }), /Conflicting team override/, query);
    assert.equal(reads, 0);
  }
});
