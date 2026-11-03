import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('        if (t.dataset.shiftMatchCard) {');
const end=source.indexOf('        if (t.dataset.lagTeam || t.dataset.matchNo) {',begin);
assert(begin>=0&&end>begin,'shift card handler must exist');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handler=new AsyncFunction('t','shiftToggleSaving','setText','byId','sessionStorage','setActiveShiftMatchButton','renderShiftSchema',source.slice(begin,end));
async function switchMatch(isSaving){
 const selection={value:'1'},messages=[],stored=[],active=[],loads=[];
 await handler({dataset:{shiftMatchCard:'2'}},isSaving,(id,message)=>messages.push([id,message]),id=>id==='shiftMatch'?selection:null,{setItem:(key,value)=>stored.push([key,value])},value=>active.push(value),async()=>loads.push('rendered'));
 return {selection,messages,stored,active,loads};
}
test('pending shift write blocks match switch and preserves match selection',async()=>{
 const result=await switchMatch(true);
 assert.equal(result.selection.value,'1');
 assert.equal(result.loads.length,0);
 assert.equal(result.stored.length,0);
 assert.equal(result.active.length,0);
 assert.match(result.messages[0][1],/Vänta tills bytet har sparats/);
});
test('after shift write finishes the next match loads normally',async()=>{
 const result=await switchMatch(false);
 assert.equal(result.selection.value,'2');
 assert.deepEqual(result.stored,[['nsk2_match_no','2']]);
 assert.deepEqual(result.active,['2']);
 assert.deepEqual(result.loads,['rendered']);
 assert.equal(result.messages.length,0);
});
