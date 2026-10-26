import test from 'node:test';
import assert from 'node:assert/strict';
import { readPersonallyAuthorizedTeamCollection } from './production-team-collection-read.js';

const team = [{id:11,Namn:'NSK Team 18','Säsong':'2026'},{id:22,Namn:'NSK Testlag 2','Säsong':'2026'}];
const actor = {user:{id:'u1'},memberships:[{team_id:'NSK Team 18',role:'coach'}],permissions:['read']};
const data = {
  poolspel:[{id:101,Lag:[{id:11}],'Antal lag':1},{id:202,Lag:[{id:22}],'Antal lag':1}],
  matchkonfiguration:[{id:301,Poolspel:[{id:101}],Lagnummer:1},{id:302,Poolspel:[{id:202}],Lagnummer:1}],
  laguppstallningar:[{id:401,Matchkonfiguration:[{id:301}],Poolspel:[{id:101}],Lagnummer:1},{id:402,Matchkonfiguration:[{id:302}],Poolspel:[{id:202}],Lagnummer:1}],
  bytesschema:[{id:501,Poolspel:[{id:101}],Lagnummer:1},{id:502,Poolspel:[{id:202}],Lagnummer:1}]
};
const deps = (a=actor) => ({
  listTrustedTeams:async()=>team,
  readRows:async name=>data[name],
  verifyPersonalSession:async()=>a
});
const req = (table, teamId='11', token='a'.repeat(64)) =>
  new Request('https://example.test/api/'+table+'?team_id='+teamId, {
    headers:token?{Authorization:'Bearer '+token}:{}
  });

for (const [table, expected] of [
  ['poolspel',101],['matchkonfiguration',301],
  ['laguppstallningar',401],['bytesschema',501]
]) {
  test(table+' returns only Team 18 rows', async()=>{
    const res=await readPersonallyAuthorizedTeamCollection(req(table),{},deps());
    assert.equal(res.status,200);
    const body=await res.json();
    assert.deepEqual(body.results.map(x=>x.id),[expected]);
  });
}
test('cross-team read denied',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('poolspel','22'),{},deps());
  assert.equal(res.status,403);
});
test('missing token denied before dependencies',async()=>{
  let called=false;
  const res=await readPersonallyAuthorizedTeamCollection(req('poolspel','11',null),{},{
    ...deps(),listTrustedTeams:async()=>{called=true;return team;}
  });
  assert.equal(res.status,401);
  assert.equal(called,false);
});
test('missing read permission denied',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('poolspel'),{},
    deps({...actor,permissions:[]}));
  assert.equal(res.status,403);
});
test('invalid ownership links fail closed',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('poolspel'),{},{
    ...deps(),readRows:async name=>name==='poolspel'?[{id:101,Lag:'11'}]:data[name]
  });
  assert.equal(res.status,503);
});
test('missing dependency fails closed',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('poolspel'),{},{});
  assert.equal(res.status,503);
});
test('duplicate team selector rejected',async()=>{
  const request=new Request('https://example.test/api/poolspel?team_id=11&team_id=22',{
    headers:{Authorization:'Bearer '+'a'.repeat(64)}
  });
  const res=await readPersonallyAuthorizedTeamCollection(request,{},deps());
  assert.equal(res.status,400);
});

test('shared pool metadata is visible but unowned match data is excluded', async()=>{
  const shared={
    ...data,
    poolspel:[...data.poolspel,{id:103,Lag:[{id:11},{id:22}],'Antal lag':2}],
    matchkonfiguration:[...data.matchkonfiguration,{id:303,Poolspel:[{id:103}]}],
    laguppstallningar:[...data.laguppstallningar,{id:403,Matchkonfiguration:[{id:303}],Poolspel:[{id:103}]}],
    bytesschema:[...data.bytesschema,{id:503,Poolspel:[{id:103}]}]
  };
  for (const [table, excluded] of [
    ['matchkonfiguration',303],
    ['laguppstallningar',403],['bytesschema',503]
  ]) {
    const res=await readPersonallyAuthorizedTeamCollection(req(table),{},{
      ...deps(),readRows:async name=>shared[name]
    });
    assert.equal(res.status,200);
    assert.equal((await res.json()).results.some(row=>row.id===excluded),false);
  }
});

test('missing pool link on lineup is never treated as authorization', async()=>{
  const modified={...data,laguppstallningar:[
    {id:401,Matchkonfiguration:[{id:301}],Poolspel:[]},
    {id:402,Matchkonfiguration:[{id:302}],Poolspel:[{id:202}],Lagnummer:1}
  ]};
  const res=await readPersonallyAuthorizedTeamCollection(req('laguppstallningar'),{},{
    ...deps(),readRows:async name=>modified[name]
  });
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).results,[]);
});
test('ambiguous multi-pool links never authorize a row', async()=>{
  const modified={...data,
    matchkonfiguration:[{id:301,Poolspel:[{id:101},{id:202}]}],
    bytesschema:[{id:501,Poolspel:[{id:101},{id:202}]}]
  };
  for (const table of ['matchkonfiguration','bytesschema']) {
    const res=await readPersonallyAuthorizedTeamCollection(req(table),{},{
      ...deps(),readRows:async name=>modified[name]
    });
    assert.equal(res.status,200);
    assert.deepEqual((await res.json()).results,[]);
  }
});

test('invalid session is rejected without reading collections', async () => {
  let reads = 0;
  const res = await readPersonallyAuthorizedTeamCollection(req('poolspel'), {}, {
    ...deps(),
    verifyPersonalSession: async () => null,
    readRows: async name => { reads++; return data[name]; }
  });
  assert.equal(res.status, 401);
  assert.equal(reads, 0);
});

test('failed trusted team lookup returns 503 without reading collections', async () => {
  let reads = 0;
  const res = await readPersonallyAuthorizedTeamCollection(req('poolspel'), {}, {
    ...deps(),
    listTrustedTeams: async () => { throw Error('Baserow unavailable'); },
    readRows: async name => { reads++; return data[name]; }
  });
  assert.equal(res.status, 503);
  assert.equal(reads, 0);
});

test('incomplete collection snapshot returns 503 instead of partial data', async () => {
  const res = await readPersonallyAuthorizedTeamCollection(req('bytesschema'), {}, {
    ...deps(),
    readRows: async name => name === 'bytesschema' ? null : data[name]
  });
  assert.equal(res.status, 503);
});

test('a lineup linked to a different pool than its configuration is rejected', async () => {
  const altered = {
    ...data,
    poolspel: [{id:101,Lag:[{id:11}],'Antal lag':1},{id:102,Lag:[{id:11}],'Antal lag':1}],
    laguppstallningar: [{id:401,Matchkonfiguration:[{id:301}],Poolspel:[{id:102}]}]
  };
  const res = await readPersonallyAuthorizedTeamCollection(req('laguppstallningar'), {}, {
    ...deps(), readRows: async name => altered[name]
  });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).results, []);
});

test('shared pool exposes only matching Lagnummer records for each team', async () => {
  const shared = {
    poolspel: [{id:103,Lag:[{id:11},{id:22}],'Antal lag':2}],
    matchkonfiguration: [
      {id:303,Poolspel:[{id:103}],Lagnummer:1},
      {id:304,Poolspel:[{id:103}],Lagnummer:2},
      {id:305,Poolspel:[{id:103}],Lagnummer:3}
    ],
    laguppstallningar: [
      {id:403,Matchkonfiguration:[{id:303}],Poolspel:[{id:103}]},
      {id:404,Matchkonfiguration:[{id:304}],Poolspel:[{id:103}]}
    ],
    bytesschema: [
      {id:503,Poolspel:[{id:103}],Lagnummer:1},
      {id:504,Poolspel:[{id:103}],Lagnummer:2},
      {id:505,Poolspel:[{id:103}],Lagnummer:0}
    ]
  };
  for (const [selected, identity, expected] of [
    ['11',actor,{poolspel:[103],matchkonfiguration:[303],laguppstallningar:[403],bytesschema:[503]}],
    ['22',{...actor,memberships:[{team_id:'NSK Testlag 2',role:'coach'}]},
      {poolspel:[103],matchkonfiguration:[304],laguppstallningar:[404],bytesschema:[504]}]
  ]) {
    for (const [table, ids] of Object.entries(expected)) {
      const response = await readPersonallyAuthorizedTeamCollection(req(table,selected),{},{
        ...deps(identity),readRows:async name=>shared[name]
      });
      assert.equal(response.status,200);
      assert.deepEqual((await response.json()).results.map(r=>r.id),ids);
    }
  }
});


const associationRows = {
  ...data,
  spelare:[{id:601,Lag:[{id:11}]},{id:602,Lag:[{id:22}]}],
  tranare:[{id:701,Lag:[{id:11}]},{id:702,Lag:[{id:22}]}],
  spelaretranare:[
    {id:801,Spelare:[{id:601}],Tränare:[{id:701}]},
    {id:802,Spelare:[{id:602}],Tränare:[{id:702}]},
    {id:803,Spelare:[{id:601}],Tränare:[{id:702}]}
  ]
};
const assocDeps = rows => ({...deps(),readRows:async name=>(rows || associationRows)[name]});
test('associations return only same-team player and coach links',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('spelaretranare'),{},assocDeps());
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).results.map(x=>x.id),[801]);
});
test('associations deny cross-team membership',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('spelaretranare','22'),{},assocDeps());
  assert.equal(res.status,403);
});
test('associations reject missing session',async()=>{
  const res=await readPersonallyAuthorizedTeamCollection(req('spelaretranare','11',null),{},assocDeps());
  assert.equal(res.status,401);
});
test('associations reject malformed links',async()=>{
  const rows={...associationRows,spelaretranare:[{id:804,Spelare:'bad',Tränare:[{id:701}]}]};
  const res=await readPersonallyAuthorizedTeamCollection(req('spelaretranare'),{},assocDeps(rows));
  assert.equal(res.status,503);
});
test('associations reject invalid roster ownership',async()=>{
  const rows={...associationRows,spelare:[{id:601,Lag:'11'}]};
  const res=await readPersonallyAuthorizedTeamCollection(req('spelaretranare'),{},assocDeps(rows));
  assert.equal(res.status,503);
});


test('pool metadata remains available when unrelated match tables are offline', async () => {
  const reads=[];
  const res=await readPersonallyAuthorizedTeamCollection(req('poolspel'),{}, {
    ...deps(),readRows:async name=>{reads.push(name);if(name!=='poolspel')throw Error('offline');return data.poolspel;}
  });
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).results.map(r=>r.id),[101]);
  assert.deepEqual(reads,['poolspel']);
});
