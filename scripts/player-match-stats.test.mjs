import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('statistics count completed pools and played shifts, exclude plans and deduplicate by player id and match',async()=>{
 const source=fs.readFileSync(new URL('../db.js',import.meta.url),'utf8');const fn=source.slice(source.indexOf('  async function listPlayerMatchStats'),source.indexOf('  async function listPlayerCoachMap'));
 const config=(id,pool,match,goalie,players)=>({id,Poolspel:[pool],Lagnummer:1,Matchnummer:match,Målvakt:[goalie],'Spelare på plan':players});
 const configs=[config(1,10,1,1,[1,2]),config(2,10,1,2,[2,3]),config(3,20,1,2,[2,1,3]),config(4,20,2,3,[3,1]),config(5,30,1,1,[1,2])];
 const shifts=[{Poolspel:[20],Lagnummer:1,Matchnummer:1,Genomfört:true,'Spelare på plan':[1,1]},{Poolspel:[20],Lagnummer:1,Matchnummer:1,Genomfört:false,'Spelare på plan':[3]}];
 const context={teamId:async()=>18,listPools:async()=>[{id:10,active:false},{id:20,active:true},{id:30,active:false,deleting:true}],listPlayers:async()=>[1,2,3].map(id=>({id,full_name:id<3?'Same name':'Zero'})),rows:async table=>table==='matchkonfiguration'?configs:shifts,first:v=>v?.[0],linked:v=>v||[],num:(v,d)=>Number(v)||d};vm.createContext(context);vm.runInContext(fn+';this.run=listPlayerMatchStats',context);
 const result=JSON.parse(JSON.stringify(await context.run()));assert.deepEqual(result.map(r=>[r.id,r.goalie_matches,r.player_matches]),[[1,1,1],[2,1,1],[3,0,0]]);
});
