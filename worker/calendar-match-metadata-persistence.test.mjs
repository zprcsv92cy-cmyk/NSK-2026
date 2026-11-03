import test from 'node:test';
import assert from 'node:assert/strict';
import {ShiftLock} from './production-api-v42-reference.js';

const tables={lag:991001,spelare:991002,tranare:991003,poolspel:991004,matcher:991005,
  laguppstallningar:991006,bytesschema:991007,malvaktsstatistik:991008,spelaretranare:991009,matchkonfiguration:991010};
const env={BASEROW_TOKEN:'fixture-token',BASEROW_TABLE_IDS:JSON.stringify(tables)};
const pool={id:3,Lag:[{id:71}],'Antal lag':2,'Antal matcher':8};
const team={id:71,Namn:'NSK Team 18','Säsong':'2026'};
function fixture({existing=[]}={}){
 const rows=[...existing];let writes=0;
 const storage=new Map();
 const fetch=async(url,init={})=>{
  const u=new URL(url),path=u.pathname.split('/table/')[1],method=init.method||'GET';
  if(method==='GET'&&path===`991004/3/`)return Response.json(pool);
  if(method==='GET'&&path===`991001/71/`)return Response.json(team);
  if(method==='GET'&&path===`991010/`)return Response.json({results:rows.filter(x=>x.id!==undefined),next:null});
  if(method==='POST'&&path===`991010/`){writes++;const row={id:900+rows.length,...JSON.parse(init.body)};rows.push(row);return Response.json(row,{status:201});}
  throw Error('Unexpected Baserow request '+method+' '+path);
 };
 const old=globalThis.fetch;globalThis.fetch=fetch;
 const lock=new ShiftLock({storage:{get:async k=>storage.get(k),put:async(k,v)=>storage.set(k,v)}},env);
 return {lock,rows,get writes(){return writes},restore(){globalThis.fetch=old}};
}
const send=(lock,body)=>lock.fetch(new Request('https://shift-lock.internal/',{method:'POST',
 headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'scheduleCreate',...body})}));
const base={pool_id:3,lag_no:1,match_no:1,start_time:'09:30',opponent:'Södertälje SK',plan:'Plan 1'};

test('calendar match metadata persists without goalie or player fields',async()=>{
 const f=fixture();try{const r=await send(f.lock,base);assert.equal(r.status,201);const j=await r.json();
 assert.equal(j.row.Lagnummer,1);assert.equal(j.row.Matchnummer,1);assert.equal(j.row.Starttid,'09:30');
 assert.equal(j.row.Motståndare,'Södertälje SK');assert.deepEqual(j.row.Poolspel,[3]);
 assert.equal(Object.hasOwn(j.row,'Målvakt'),false);assert.equal(Object.hasOwn(j.row,'Spelare på plan'),false);
 assert.equal(f.writes,1);}finally{f.restore()}
});

test('same pool team match is not duplicated on retry',async()=>{
 const f=fixture();try{assert.equal((await send(f.lock,base)).status,201);
 assert.equal((await send(f.lock,base)).status,409);assert.equal(f.writes,1);}finally{f.restore()}
});

test('schedule metadata never overwrites an existing lineup',async()=>{
 const existing=[{id:44,Poolspel:[3],Lagnummer:1,Matchnummer:1,Målvakt:[{id:7}],'Spelare på plan':[{id:8},{id:9}],Starttid:'08:00','Motståndare':'Old',Plan:'Plan 2'}];
 const f=fixture({existing});try{const r=await send(f.lock,base);assert.equal(r.status,409);
 assert.deepEqual(f.rows[0].Målvakt,[{id:7}]);assert.deepEqual(f.rows[0]['Spelare på plan'],[{id:8},{id:9}]);assert.equal(f.writes,0);}finally{f.restore()}
});

test('out-of-range match and invalid schedule fields are rejected without writes',async()=>{
 const f=fixture();try{
 assert.equal((await send(f.lock,{...base,match_no:9})).status,403);
 assert.equal((await send(f.lock,{...base,start_time:'25:99'})).status,400);
 assert.equal((await send(f.lock,{...base,opponent:' '})).status,400);
 assert.equal((await send(f.lock,{...base,goalie_player_id:7})).status,400);
 assert.equal(f.writes,0);
 }finally{f.restore()}
});

test('pool ownership mismatch fails closed before match metadata write',async()=>{
 const f=fixture();try{
 const old=globalThis.fetch;globalThis.fetch=async(url,init={})=>{
  const u=new URL(url),path=u.pathname.split('/table/')[1];
  if(path==='991004/3/')return Response.json(pool);
  if(path==='991001/71/')return Response.json({...team,id:72});
  throw Error('Unexpected request '+path);
 };
 const r=await send(f.lock,base);assert.equal(r.status,503,'unverifiable canonical team identity fails closed');assert.equal(f.writes,0);globalThis.fetch=old;
 }finally{f.restore()}
});
