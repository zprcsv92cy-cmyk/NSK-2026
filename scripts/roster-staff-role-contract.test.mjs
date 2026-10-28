import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../db.js',import.meta.url),'utf8');
async function run(enabled, role, action='write') {
  const calls=[];
  const sandbox={
    window:{
      APP_CONFIG:{API_URL:'https://api.example',REQUIRE_PERSONAL_ROSTER_WRITES:enabled,REQUIRE_SCOPED_ROSTER_READS:enabled},
      Auth:{activeTeam:()=> 'NSK Team 18',getToken:()=> 'p'.repeat(43),checkTeamFeature:async(feature,team)=>feature==='roster'&&team==='NSK Team 18'}
    },
    localStorage:{getItem:()=> 'legacy-admin'},
    fetch:async (url,options={})=>{
      calls.push({url,options});
      if(url.includes('/api/lag?'))return {ok:true,json:async()=>({ok:true,results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}],next:null})};
      if(url.includes('/api/lagpersonal?') && !options.method)return {ok:true,json:async()=>({ok:true,results:[{id:'a',name:'Person A',role:'Lagledare'},{id:'b',name:'Person B',role:'leader'}]})};
      return {ok:true,json:async()=>({ok:true,row:{id:'c',role}})};
    },
    URL,console
  };
  vm.runInNewContext(source,sandbox);
  const output=action==='list'?await sandbox.window.DB.listStaff(role):await sandbox.window.DB.addStaff(role,'Person C');
  return {calls,output};
}

test('staff names use protected API roles and disabled personal writes never use shared admin',async()=>{
 for(const [role,swedish] of [['leader','Lagledare'],['fitness','Fysansvarig'],['equipment','Materialförvaltare']]){
   const now=await run(true,role);
   await assert.rejects(()=>run(false,role),/Personlig inloggning/);
   const write=now.calls.find(x=>x.options.method==='POST');
   assert.equal(JSON.parse(write.options.body).role,swedish);
   assert.equal(write.options.headers.Authorization,'Bearer '+'p'.repeat(43));
 }
});

test('listStaff supports existing role keys and new protected API role names',async()=>{
 const {output}=await run(true,'leader','list');
 assert.deepEqual(Array.from(output.map(x=>x.full_name)),['Person A','Person B']);
});

test('unexpected staff roles are rejected before mutations',async()=>{
 await assert.rejects(()=>run(true,'unknown'),/Ogiltig funktion/);
});

test('personal staff write stops if the active team changes during Baserow lookup', async () => {
  let active = 'NSK Team 18';
  const writes = [];
  const sandbox = {
    window: {
      APP_CONFIG: { API_URL: 'https://api.example', REQUIRE_PERSONAL_ROSTER_WRITES: true, REQUIRE_SCOPED_ROSTER_READS: true },
      Auth: { activeTeam: () => active, getToken: () => 'p'.repeat(43), checkTeamFeature: async () => true }
    },
    localStorage: { getItem: () => 'legacy-admin' },
    fetch: async (url, options = {}) => {
      if (url.includes('/api/lag?')) {
        active = 'NSK Testlag 2';
        return { ok: true, json: async () => ({ ok: true, results: [
          { id: 18, Namn: 'NSK Team 18', 'Säsong': '2026' }
        ], next: null }) };
      }
      writes.push({ url, options });
      return { ok: true, json: async () => ({ ok: true, row: { id: 'c' } }) };
    },
    URL, console
  };
  vm.runInNewContext(source, sandbox);
  await assert.rejects(() => sandbox.window.DB.addStaff('leader', 'Person C'), /Lagvalet ändrades/);
  assert.equal(writes.length, 0);
});
