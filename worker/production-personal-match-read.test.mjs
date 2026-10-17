import assert from 'node:assert/strict';
import { handlePersonalMatchRead } from './production-personal-match-read.js';
import candidate from './production-entry-candidate.js';
const token='A'.repeat(43),url='https://nsk-api.invalid';
const req=(type,team='18',pool='100',auth=token)=>new Request(
  url+'/api/personal/'+type+'?team_id='+team+'&pool_id='+pool,{
    headers:{...(auth?{Authorization:'Bearer '+auth}:{}),Origin:'https://zprcsv92cy-cmyk.github.io'}
  });
const env={BASEROW_TOKEN:'test',AUTH_DB:{prepare(sql){return {bind(){return {
  first:async()=>({id:'u1',display_name:'Tester'}),
  all:async()=>({results:sql.includes('auth_team_memberships')?
    [{team_id:'NSK Team 18',role:'viewer'}]:[{permission:'read'}]})
};}}}}};
let reads=[];
const records={
  1255083:[{id:18,Namn:'NSK Team 18','Säsong':'2026'},{id:27,Namn:'NSK Testlag 2','Säsong':'2026'}],
  1255101:[{id:100,Namn:'Home Pool',Lag:[18]},{id:200,Namn:'Other Pool',Lag:[27]}],
  1255157:[{id:10,Poolspel:[100],Matchnummer:1},{id:20,Poolspel:[200],Matchnummer:1}],
  1255113:[{id:11,Poolspel:[100],Matchkonfiguration:[10]},{id:21,Poolspel:[200],Matchkonfiguration:[20]},
           {id:31,Poolspel:[100],Matchkonfiguration:[20]}],
  1255115:[{id:12,Poolspel:[100],Genomfört:false},{id:22,Poolspel:[200],Genomfört:true}]
};
const original=globalThis.fetch;
globalThis.fetch=async input=>{
  const id=Number(/\/table\/(\d+)\//.exec(String(input))?.[1]);
  if(!records[id])throw Error('Unexpected table');
  reads.push(id);
  return Response.json({results:records[id],next:null});
};
try{
  for(const [type,expected] of [['matchkonfiguration',[10]],['laguppstallningar',[11]],['bytesschema',[12]]]){
    const r=await handlePersonalMatchRead(req(type),env);
    assert.equal(r.status,200,type);
    assert.deepEqual((await r.json()).results.map(x=>x.id),expected);
  }
  const before=reads.length;
  for(const type of ['matchkonfiguration','laguppstallningar','bytesschema']){
    const r=await handlePersonalMatchRead(req(type,'27','200'),env);
    assert.equal(r.status,403,type);
  }
  assert.equal(reads.length,before+3,'Unauthorized team must never read pools or match tables');
  const foreign=await handlePersonalMatchRead(req('matchkonfiguration','18','200'),env);
  assert.equal(foreign.status,403);
  const unauthorized=await handlePersonalMatchRead(req('matchkonfiguration','18','100',null),env);
  assert.equal(unauthorized.status,401);
  const entry=await candidate.fetch(req('laguppstallningar'),env,{});
  assert.equal(entry.status,200);
  assert.deepEqual((await entry.json()).results.map(x=>x.id),[11]);
  console.log('PASS scoped match, lineup and shift reads');
}finally{globalThis.fetch=original;}
