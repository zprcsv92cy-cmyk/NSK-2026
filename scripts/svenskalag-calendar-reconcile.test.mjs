import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarEventKey,planCalendarReconciliation} from '../worker/svenskalag-calendar-reconcile.js';

test('new calendar entries are planned without writes',()=>{
 const p=planCalendarReconciliation([{type:'training',date:'2026-11-01',hall:'Lilla Hallen'}],[]);
 assert.equal(p.create.length,1);assert.deepEqual(p.delete,[]);
});
test('manual and manually edited entries are preserved',()=>{
 const item={type:'training',date:'2026-11-01'};
 const key=calendarEventKey(item);
 for(const previous of [{key,source:'manual'},{key,source:'svenskalag',manuallyEdited:true}]){
  const p=planCalendarReconciliation([item],[previous]);
  assert.equal(p.update.length,0);assert.equal(p.preserve.length,1);
 }
});
test('only untouched imported entries are eligible for update',()=>{
 const item={type:'match',date:'2026-11-02',startTime:'10:30',opponent:'Nyköping'};
 const key=calendarEventKey(item);
 const p=planCalendarReconciliation([item],[{key,source:'svenskalag',manuallyEdited:false}]);
 assert.equal(p.update.length,1);
});
test('missing entries are never deleted and duplicate feed entries collapse',()=>{
 const item={type:'pool',date:'2026-11-02',place:'Rosvalla'};
 const p=planCalendarReconciliation([item,item],[{key:'training:2026-11-03',source:'svenskalag'}]);
 assert.equal(p.create.length,1);assert.deepEqual(p.delete,[]);
});
