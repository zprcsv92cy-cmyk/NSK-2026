import test from 'node:test';
import assert from 'node:assert/strict';
import { readPersonallyAuthorizedTeamCollection } from './production-team-collection-read.js';

const team = [{id:11,Namn:'NSK Team 18','Säsong':'2026'},{id:22,Namn:'NSK Testlag 2','Säsong':'2026'}];
const actor = {user:{id:'u1'},memberships:[{team_id:'NSK Team 18',role:'coach'}],permissions:['read']};
const data = {
  poolspel:[{id:101,Lag:[{id:11}]},{id:202,Lag:[{id:22}]}],
  matchkonfiguration:[{id:301,Poolspel:[{id:101}]},{id:302,Poolspel:[{id:202}]}],
  laguppstallningar:[{id:401,Matchkonfiguration:[{id:301}],Poolspel:[{id:101}]},{id:402,Matchkonfiguration:[{id:302}],Poolspel:[{id:202}]}],
  bytesschema:[{id:501,Poolspel:[{id:101}]},{id:502,Poolspel:[{id:202}]}]
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

test('shared pool and its match data are excluded until ownership is verified', async()=>{
  const shared={
    ...data,
    poolspel:[...data.poolspel,{id:103,Lag:[{id:11},{id:22}]}],
    matchkonfiguration:[...data.matchkonfiguration,{id:303,Poolspel:[{id:103}]}],
    laguppstallningar:[...data.laguppstallningar,{id:403,Matchkonfiguration:[{id:303}],Poolspel:[{id:103}]}],
    bytesschema:[...data.bytesschema,{id:503,Poolspel:[{id:103}]}]
  };
  for (const [table, excluded] of [
    ['poolspel',103],['matchkonfiguration',303],
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
    {id:402,Matchkonfiguration:[{id:302}],Poolspel:[{id:202}]}
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
