import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function fixture(){
 const pending=[];let reads=0;
 const context={shiftLoadsInFlight:0,shiftRefreshBusy:false,shiftToggleSaving:false,document:{hidden:false},window:{NSKShellActive:true},byId:()=>({}),DB:{listShiftSchema:async()=>{reads++;throw Error('unexpected timer read');}},renderShiftSchemaData:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))};
 const refresh=source.slice(source.indexOf('  async function refreshShiftDoneMarks()'),source.indexOf('  if (!window.__nskShiftSyncBound)'));
 const render=source.slice(source.indexOf('  async function renderShiftSchema()'),source.indexOf('  async function renderShiftSchemaData()'));
 vm.runInNewContext(refresh+render+'this.render=renderShiftSchema;this.refresh=refreshShiftDoneMarks;',context);
 return {context,pending,reads:()=>reads};
}
test('timer does not restart a pending match load, including overlapping rapid match choices',async()=>{
 const f=fixture(),a=f.context.render(),b=f.context.render();assert.equal(f.context.shiftLoadsInFlight,2);
 await f.context.refresh();assert.equal(f.reads(),0);
 f.pending[0].resolve();await a;assert.equal(f.context.shiftLoadsInFlight,1);
 await f.context.refresh();assert.equal(f.reads(),0);
 f.pending[1].resolve();await b;assert.equal(f.context.shiftLoadsInFlight,0);
});
test('failed match load releases the timer guard for recovery',async()=>{
 const f=fixture(),load=f.context.render();f.pending[0].reject(Error('503'));await assert.rejects(load,/503/);assert.equal(f.context.shiftLoadsInFlight,0);
});
