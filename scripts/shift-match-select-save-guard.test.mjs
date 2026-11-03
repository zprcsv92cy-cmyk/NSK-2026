import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const begin=source.indexOf('        matchSelect.addEventListener("change", async () => {');
const end=source.indexOf('\n      }\n\n      byId(\'shiftUndoButton\')',begin);
assert(begin>=0&&end>begin,'shift selector change handler must be found');
const handlerSource=source.slice(begin,end);
const body=handlerSource.match(/matchSelect\.addEventListener\("change", async \(\) => \{([\s\S]*?)\n        \}\);/);
assert(body,'shift selector handler must be extractable');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handle=new AsyncFunction('matchSelect','shiftToggleSaving','sessionStorage','setActiveShiftMatchButton','setText','renderShiftSchema',body[1]);
async function change({pending,initial='1',chosen='2'}){
 const matchSelect={value:chosen},session=new Map([['nsk2_match_no',initial]]),active=[],messages=[],renders=[];
 await handle(matchSelect,pending,{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},m=>active.push(m),(k,v)=>messages.push([k,v]),async()=>renders.push(matchSelect.value));
 return {matchSelect,session,active,messages,renders};
}
test('dropdown cannot switch matches while checkmark write is pending',async()=>{
 const result=await change({pending:true});
 assert.equal(result.matchSelect.value,'1');
 assert.equal(result.session.get('nsk2_match_no'),'1');
 assert.deepEqual(result.active,['1']);
 assert.deepEqual(result.renders,[]);
 assert.match(result.messages[0][1],/Vänta tills bytet har sparats/);
});
test('dropdown switches normally after pending checkmark write completes',async()=>{
 const result=await change({pending:false});
 assert.equal(result.matchSelect.value,'2');
 assert.equal(result.session.get('nsk2_match_no'),'2');
 assert.deepEqual(result.active,['2']);
 assert.deepEqual(result.renders,['2']);
 assert.deepEqual(result.messages,[]);
});
