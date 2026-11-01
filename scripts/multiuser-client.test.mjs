import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const structure=rows=>JSON.stringify(rows.map(r=>[r.id,r.shift_no,r.period_no,r.time_left,r.players_json]));
function fixture(rows){const messages=[],checks=rows.map(r=>({dataset:{shiftToggle:r.shift_no},classList:{toggle(){}},setAttribute(){}}));let fresh=rows,rebuilds=0;
 const ctx={document:{hidden:false,querySelectorAll:()=>checks},window:{NSKShellActive:true},byId:id=>id==='shiftMatch'?{value:'1'}:{},sessionStorage:{getItem:k=>k==='nsk2_pool_id'?'10':'1'},DB:{listShiftSchema:async()=>fresh},shiftToggleSaving:false,shiftRefreshBusy:false,shiftViewGeneration:0,shiftDoneVersion:0,shiftStructure:structure(rows),shiftStructureOf:structure,shiftBackgroundRefresh:false,setText:(id,text)=>messages.push([id,text]),console,renderShiftSchema:async()=>{assert.equal(ctx.shiftBackgroundRefresh,true);rebuilds++;}};
 const start=source.indexOf('  async function refreshShiftDoneMarks()'),end=source.indexOf('\n  if (!window.__nskShiftSyncBound)',start);vm.runInNewContext(source.slice(start,end)+';globalThis.refresh=refreshShiftDoneMarks;',ctx);
 return {ctx,messages,refresh:ctx.refresh,setRows:r=>fresh=r,rebuilds:()=>rebuilds};
}
const rows=[{id:1,shift_no:1,period_no:1,time_left:'10:00',players_json:[1,2,3],done:false}];
test('remote changes to row count, times, players or row identity refresh the actual schedule',async()=>{
 for(const next of [[...rows,{...rows[0],id:2,shift_no:2}],rows.map(r=>({...r,time_left:'09:00'})),rows.map(r=>({...r,players_json:[4,5,6]})),rows.map(r=>({...r,id:99}))]){
  const f=fixture(rows);f.setRows(next);await f.refresh();assert.equal(f.rebuilds(),1);assert.equal(f.ctx.shiftBackgroundRefresh,false);assert(f.messages.some(([,v])=>v.includes('uppdaterat bytesschema')));assert(!f.messages.some(([,v])=>v.startsWith('Uppdaterat ')));
 }
});
test('ordinary checked shifts update in place; an in-flight local write postpones remote refresh',async()=>{
 const f=fixture(rows);f.setRows(rows.map(r=>({...r,done:true})));await f.refresh();assert.equal(f.rebuilds(),0);
 f.ctx.shiftToggleSaving=true;f.setRows([]);await f.refresh();assert.equal(f.rebuilds(),0);
});

test('a refresh read begun before a completed local toggle cannot restore an old checkmark',async()=>{
 const f=fixture(rows);let release;f.ctx.DB.listShiftSchema=()=>new Promise(r=>release=r);const pending=f.refresh();
 f.ctx.shiftDoneVersion++;f.ctx.shiftToggleSaving=false;
 release(rows.map(r=>({...r,done:true})));await pending;
 assert.equal(f.rebuilds(),0);assert.equal(f.messages.length,0);
});
