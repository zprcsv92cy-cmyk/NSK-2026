import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../db.js',import.meta.url),'utf8');
const tables={
 lag:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}],
 spelare:[{id:473,Namn:'Testspelare',Lag:[18]},{id:474,Namn:'Testmålvakt',Lag:[18]}],
 tranare:[{id:12,Namn:'Testtränare',Lag:[18]}],
 lagpersonal:[],
 matchkonfiguration:[{id:673,Poolspel:[90],Lagnummer:1,Matchnummer:1,Målvakt:[474],'Spelare på plan':[473,474]}],
 laguppstallningar:[{id:41,Poolspel:[90],Matchkonfiguration:[673],Persontyp:'Spelare','Person-ID':473,Sorteringsordning:1},{id:42,Poolspel:[90],Matchkonfiguration:[673],Persontyp:'Tränare','Person-ID':12,Sorteringsordning:2}],
 bytesschema:[{id:51,Poolspel:[90],Lagnummer:1,Matchnummer:1,Bytenummer:1,Periodnummer:1,'Spelare på plan':[473,474],Genomfört:false}],
 poolspel:[],spelaretranare:[]
};
let requests=0;
const context={window:{APP_CONFIG:{API_URL:'https://mock.invalid'}},fetch:async (input,opts={})=>{
 assert.equal(opts.method||'GET','GET','Only reads allowed');
 const url=new URL(input);assert.equal(url.origin,'https://mock.invalid');
 const table=url.pathname.split('/').pop();assert.ok(Object.hasOwn(tables,table),'Unexpected table: '+table);
 requests++;
 return {ok:true,json:async()=>({ok:true,results:tables[table],next:null})};
}};
vm.runInNewContext(source,context,{filename:'db.js'});
const db=context.window.DB;
const players=await db.listPlayers();
const coaches=await db.listCoaches();
assert.deepEqual(Array.from(players,x=>x.id),[474,473]);
assert.deepEqual(Array.from(coaches,x=>x.id),[12]);
assert.deepEqual(Array.from(await db.getPlayersOnField(90,1,1),x=>x.id),[474,473]);
const lineup=await db.getLineup(673);
assert.deepEqual(Array.from(lineup,x=>x.person_id),[473,12]);
const shifts=await db.listShiftSchema(90,1,1);
assert.deepEqual(Array.from(shifts[0].players_json),[473,474]);
assert.ok(requests>0);
console.log('PASS: real db.js functions retain numeric roster, match, lineup and shift links with mocked API responses');
