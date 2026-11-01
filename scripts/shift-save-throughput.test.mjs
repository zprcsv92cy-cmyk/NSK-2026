import test from 'node:test';import assert from 'node:assert/strict';
import {ShiftLock} from '../worker/production-api-v42-reference.js';
function fixture(t){
 const records=[],before=globalThis.fetch;let writes=0,failAt=0;const tables={pool:1255101,team:1255083,players:1255098,shifts:1255115};
 globalThis.fetch=async(input,options={})=>{const url=new URL(input);assert.equal(url.origin,'https://api.baserow.io');const parts=url.pathname.split('/'),table=Number(parts[5]),id=Number(parts[6]);
  if(table===tables.pool)return Response.json({id:10,Lag:[18],'Antal lag':1,'Antal matcher':3,Perioder:1});
  if(table===tables.team)return Response.json({id:18,Namn:'NSK Team 18'});
  if(table===tables.players)return Response.json({results:[2,3,4].map(id=>({id,Lag:[18]})),next:null});
  if(table===tables.shifts){if(!options.method||options.method==='GET')return id?Response.json(records.find(r=>r.id===id)):Response.json({results:records,next:null});if(writes+1===failAt){failAt=0;return Response.json({error:'Synthetic interruption'},{status:502});}writes++;const payload=JSON.parse(options.body);if(options.method==='POST'){const row={id:100+records.length,...payload};records.push(row);return Response.json(row);}const row=records.find(r=>r.id===id);Object.assign(row,payload);return Response.json(row);}
  throw Error('Unexpected synthetic request');
 };
 t.after(()=>{globalThis.fetch=before;});const lock=new ShiftLock({storage:{get:async()=>undefined}},{BASEROW_TOKEN:'synthetic'});
 const shifts=Array.from({length:15},(_,i)=>({period_no:1,time_left:String(15-i).padStart(2,'0')+':00',players:[2,3,4]}));
 const save=()=>lock.fetch(new Request('https://internal.invalid/',{method:'POST',body:JSON.stringify({action:'save',pool_id:10,lag_no:1,match_no:3,shifts})}));
 return {save,records,shifts,writes:()=>writes,fail(n){failAt=n;}};
}
test('fifteen new shifts complete in bounded request batches',async t=>{
 const f=fixture(t);let calls=0,result;do{const response=await f.save();calls++;assert.equal(response.status,200);result=await response.json();assert(calls<=20);}while(result.cleanup_pending);
 assert.equal(calls,3);assert.equal(result.count,15);assert.equal(f.writes(),15);assert.equal(f.records.length,15);
});

test('a failed batch resumes from its saved rows without duplicates or lost checks',async t=>{
 const f=fixture(t);f.fail(7);let r=await f.save();assert.equal(r.status,200);assert.equal((await r.json()).cleanup_pending,true);r=await f.save();assert.equal(r.status,502);assert.equal(f.records.length,6);
 let result;do{r=await f.save();assert.equal(r.status,200);result=await r.json();}while(result.cleanup_pending);
 assert.equal(result.count,15);assert.equal(new Set(f.records.map(r=>r.Bytenummer)).size,15);assert.equal(f.writes(),15);
 f.records[0].Genomfört=true;const before=f.writes();r=await f.save();assert.equal(r.status,200);assert.equal(f.writes(),before);assert.equal(f.records[0].Genomfört,true);
});

test('completed marks still prevent a partially created schedule from being replaced',async t=>{
 const f=fixture(t);await f.save();assert.equal(f.records.length,5);f.records[0].Genomfört=true;
 const r=await f.save();assert.equal(r.status,409);assert.equal(f.writes(),5);assert.equal(f.records[0].Genomfört,true);
});
