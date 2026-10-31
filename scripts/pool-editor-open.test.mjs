import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../pool-schedule-editor.js',import.meta.url),'utf8');
// Inspect the synchronous click prefix without starting module or network loading.
test('schedule editor opens synchronously and can be cancelled before any asynchronous work',async()=>{
 let click,dialog;const controls=new Map();
 const document={currentScript:{src:'https://nsk.test/pool-schedule-editor.js'},addEventListener:(_,fn)=>click=fn,body:{append(){}},createElement:()=>dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector:s=>{if(!controls.has(s))controls.set(s,{});return controls.get(s);}}};
 vm.runInNewContext(source,{document,window:{},URL});
 const trigger={disabled:false};const pending=click({target:{closest:()=>trigger},preventDefault(){},stopPropagation(){}});
 assert.equal(dialog.open,true);assert.match(dialog.innerHTML,/Hämtar matchuppgifter/);controls.get('[data-loading-cancel]').onclick();assert.equal(dialog.open,false);
 // The VM intentionally cannot import: a closed dialog must stay closed on failure.
 await pending;assert.equal(dialog.open,false);assert.equal(trigger.disabled,false);
});
