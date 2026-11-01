import test from 'node:test';import assert from 'node:assert/strict';
import {planRetimedShifts,installShiftRetime} from '../worker/shift-retime.js';
const pool={id:10,Lag:[18],Aktiv:true,'Antal lag':1,'Antal matcher':1,Perioder:1,Periodtid:15,Bytestid:120};
const old=()=>Array.from({length:10},(_,i)=>({id:i+1,Poolspel:[10],Lagnummer:1,Matchnummer:1,Bytenummer:i+1,Periodnummer:1,'Tid kvar':`${String(Math.floor((900-i*90)/60)).padStart(2,'0')}:${String((900-i*90)%60).padStart(2,'0')}`,'Spelare på plan':[i%2+1],Genomfört:i<3}));
test('whole schedule gets new times and same player assignments; shorter and longer intervals supported',()=>{
 const rows=old(),p=planRetimedShifts(rows,pool);assert.equal(p.length,8);assert.deepEqual(p.slice(0,4).map(x=>x.time_left),['15:00','13:00','11:00','09:00']);assert.deepEqual(p.slice(0,4).map(x=>x.players),[[1],[2],[1],[2]]);assert.equal(planRetimedShifts(rows,{...pool,Bytestid:60}).length,15);assert.equal(planRetimedShifts(rows,{...pool,Perioder:2}).length,16);
});
test('completed slots beyond the new playing time remain as completed history',()=>{const rows=old();rows[8].Genomfört=true;const p=planRetimedShifts(rows,{...pool,Bytestid:900});assert.equal(p.length,9);assert.equal(p[8].time_left,'00:00');});
function fixture(){const data=old(),state=new Map(),writes=[];let fail=false;
 class Lock{constructor(){this.env={};this.storage={get:async k=>structuredClone(state.get(k)),put:async(k,v)=>state.set(k,structuredClone(v)),delete:async k=>state.delete(k)};}async save(){return Response.json({ok:true,legacy:true});}async done(body){const row=data.find(r=>r.id===body?.id);if(row)row.Genomfört=body.done;return Response.json({ok:true});}}
 installShiftRetime(Lock,{resolveTables:()=>({poolspel:1,bytesschema:2}),resolveOwner:()=>async()=>({baserowTeamRowId:18}),fetcher:async(url,init={})=>{const u=new URL(url),parts=u.pathname.split('/'),table=Number(parts[5]),id=Number(parts[6]);if(table===1)return Response.json(pool);if(init.method==='PATCH'){if(fail){fail=false;return new Response(null,{status:502});}const r=data.find(x=>x.id===id);Object.assign(r,JSON.parse(init.body));writes.push({id,body:JSON.parse(init.body)});return Response.json(r);}if(init.method==='DELETE'){data.splice(data.findIndex(x=>x.id===id),1);return new Response(null,{status:204});}if(init.method==='POST'){const r={id:Math.max(...data.map(x=>x.id))+1,...JSON.parse(init.body)};data.push(r);return Response.json(r);}return Response.json({results:data,next:null});}});
 return {lock:new Lock(),data,writes,state,fail(){fail=true;}};
}
const body={retime:true,pool_id:10,lag_no:1,match_no:1};
test('retime changes all times, retains first three checkmarks and row ids, safely resumes interruption',async()=>{const x=fixture();x.fail();assert.equal((await x.lock.save(body)).status,503);assert.equal((await x.lock.done({})).status,409);let response;do{response=await x.lock.save(body);assert.equal(response.status,200);}while((await response.json()).pending);assert.equal(x.data.length,8);assert.deepEqual(x.data.slice(0,4).map(r=>r.Genomfört),[true,true,true,false]);assert.deepEqual(x.data.slice(0,4).map(r=>r.id),[1,2,3,4]);assert.equal(x.data[1]['Tid kvar'],'13:00');assert(x.writes.every(x=>!Object.hasOwn(x.body,'Genomfört')));assert.equal(x.state.size,0);assert.equal((await x.lock.done({})).status,200);});

test('checking a shift resumes an interrupted retime without discarding its plan',async()=>{const x=fixture();x.fail();assert.equal((await x.lock.save(body)).status,503);const check={id:4,pool_id:10,lag_no:1,match_no:1,done:true};let r;do{const response=await x.lock.done(check);assert.equal(response.status,200);r=await response.json();}while(r.pending_retime);assert.equal(x.state.size,0);assert.equal(x.data[3].Genomfört,true);assert.equal(x.data[1]['Tid kvar'],'13:00');assert.deepEqual(x.data.slice(0,3).map(r=>r.Genomfört),[true,true,true]);});

test('an unchecked first shift stays unchecked when the schedule is recalculated',async()=>{
 const x=fixture();await x.lock.done({id:1,pool_id:10,lag_no:1,match_no:1,done:false});
 let response;do{response=await x.lock.save(body);assert.equal(response.status,200);}while((await response.json()).pending);
 assert.equal(x.data[0].Genomfört,false);assert.equal(x.data[1].Genomfört,true);
});
