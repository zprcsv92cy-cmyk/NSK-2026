import test from 'node:test';
import assert from 'node:assert/strict';
import {createEquipmentHandler,validateEquipmentBoard} from '../worker/equipment-api.js';
const teams=[{id:18,Namn:'A','Säsong':'2026'},{id:19,Namn:'B','Säsong':'2026'}];
const board=()=>({revision:0,requests:[{id:'request-1',kind:'player',personId:'101',name:'Testspelare',note:'Inför träning',done:false}],checklists:[{id:'list-1',title:'Bortamatch',items:[{id:'item-1',label:'Puckar',done:false}]}]});
const req=(method='GET',team='18',data,token='valid')=>new Request('https://example.test/api/equipment?team_id='+team,{method,headers:token?{Authorization:'Bearer '+token}:{},...(data===undefined?{}:{body:JSON.stringify(data)})});
function fixture(){
 let role='equipment',member='A',permissions=['read'];const rows=new Map();let storageCalls=0;
 const db={prepare(sql){storageCalls++;let args;const stmt={bind(...p){args=p;return stmt;},async first(){return rows.get(args[0])||null;},async run(){
  if(sql.startsWith('INSERT')){const [team,json,,]=args;if(rows.has(team))return {meta:{changes:0}};rows.set(team,{board_json:json,revision:1});}
  else{const [json,,team,revision]=args,r=rows.get(team);if(!r||r.revision!==revision)return {meta:{changes:0}};rows.set(team,{board_json:json,revision:revision+1});}
  return {meta:{changes:1}};
 }};return stmt;}};
 return {handler:createEquipmentHandler({AUTH_DB:db},async()=>teams,{readPerson:async(team,kind,id)=>({name:'Testspelare'}),verifyIdentity:async t=>t==='valid'?{user:{id:'one'},memberships:[{team_id:member,role}],permissions}:null}),rows,setRole:r=>role=r,setMember:m=>member=m,setPermissions:p=>permissions=p,calls:()=>storageCalls};
}
test('equipment denies anonymous, invalid token, wrong team, duplicate team and read-only writes before storage',async()=>{
 const f=fixture();assert.equal((await f.handler(req('GET','18',undefined,''))).status,401);
 assert.equal((await f.handler(req('PUT','18',board(),'wrong'))).status,401);
 assert.equal((await f.handler(req('GET','19'))).status,403);
 assert.equal((await f.handler(req('GET','18&team_id=19'))).status,400);
 f.setRole('viewer');assert.equal((await f.handler(req('PUT','18',board()))).status,403);
 f.setPermissions([]);assert.equal((await f.handler(req())).status,403);assert.equal(f.calls(),0);
});
test('equipment persists requests and checklists; stale writes cannot overwrite; teams stay separate',async()=>{
 const f=fixture();assert.equal((await f.handler(req('PUT','18',board()))).status,200);
 assert.equal((await f.handler(req('PUT','18',board()))).status,409);
 const saved=await (await f.handler(req())).json();assert.equal(saved.revision,1);assert.equal(saved.requests[0].name,'Testspelare');
 const next=board();next.revision=1;next.requests[0].done=true;next.checklists[0].items[0].done=true;
 assert.equal((await f.handler(req('PUT','18',next))).status,200);assert.equal((await f.handler(req('PUT','18',next))).status,409);
 f.setMember('B');assert.deepEqual((await (await f.handler(req('GET','19'))).json()).requests,[]);
 assert.equal((await f.handler(req('PUT','19',board()))).status,200);assert.equal(f.rows.size,2);
 f.setMember('A');f.setRole('viewer');const read=await (await f.handler(req())).json();assert.equal(read.canWrite,false);assert.equal(read.requests[0].done,true);
});
test('equipment rejects malformed boards, duplicates and oversized bodies',async()=>{
 for(const bad of [null,{}, {...board(),revision:-1},{...board(),requests:[null]},{...board(),checklists:[null]},{...board(),requests:[...board().requests,...board().requests]},{...board(),injected:true}])assert.equal(validateEquipmentBoard(bad),false);
 const f=fixture();assert.equal((await f.handler(req('PUT','18',{...board(),checklists:[{id:'x',title:'a',items:[null]}]}))).status,400);
 assert.equal((await f.handler(req('PUT','18',{note:'x'.repeat(200001)}))).status,413);assert.equal(f.calls(),0);
});
test('equipment API denies unsupported methods',async()=>assert.equal((await fixture().handler(req('DELETE'))).status,405));
