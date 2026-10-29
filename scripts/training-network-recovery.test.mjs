import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../shared-training.js',import.meta.url),'utf8');
function fixture(stage,body){
 let failing=true,clears=0;const calls=[],controllers=[];
 const context={window:{NSKViewCache:{clear(){clears++;}}},sessionStorage:{removeItem(){clears++;}},Auth:{activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic-session'},AbortSignal:{timeout(ms){assert.equal(ms,15000);const c=new AbortController();controllers.push(c);return c.signal;}},fetch:async(url,options)=>{
  calls.push({url,options});
  const stall=()=>new Promise((resolve,reject)=>{if(!options.signal){reject(Error('Missing deadline'));return;}options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
  if(failing&&stage==='lookup')return stall();
  if(url.endsWith('/api/lag'))return {ok:true,json:async()=>({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]})};
  if(failing&&stage==='headers')return stall();
  return {ok:true,json:async()=>{if(failing&&stage==='body')return stall();if(stage==='custom')return body;if(failing&&stage==='invalid')throw new SyntaxError('Invalid JSON');return {ok:true,revision:2,session:{}};}};
 }};
 vm.runInNewContext(source,context);
 return {api:context.window.SharedTraining,calls,clears:()=>clears,recover(){failing=false;},async expire(){await new Promise(resolve=>setImmediate(resolve));controllers.at(-1)?.abort(new DOMException('Timed out','TimeoutError'));}};
}
for(const stage of ['lookup','headers','body'])test(`stalled training ${stage} fails without automatic retry and permits an explicit new request`,async()=>{
 const f=fixture(stage);const pending=f.api.save('2026-10-31',{selected:[]});const rejected=assert.rejects(pending,/tog för lång tid/);await f.expire();await rejected;
 assert.equal(f.clears(),0);assert.equal(f.calls.length,stage==='lookup'?1:2);
 f.recover();const saved=await f.api.save('2026-10-31',{selected:[]});assert.equal(saved.revision,2);assert.equal(f.clears(),2);
});
test('an unreadable successful response never confirms a training save or clears caches',async()=>{
 const f=fixture('invalid');await assert.rejects(f.api.save('2026-10-31',{selected:[]}),/bekräftas/);assert.equal(f.clears(),0);assert.equal(f.calls.length,2);
});

test('a save or deletion requires an explicit valid server confirmation',async()=>{
 for(const body of [{},{ok:false},{ok:true},{ok:true,revision:0},{ok:true,revision:'2'},null,[]]){
  const f=fixture('custom',body);await assert.rejects(f.api.save('2026-10-31',{selected:[]}),/bekräftas/);assert.equal(f.clears(),0);
 }
 const f=fixture('custom',{ok:true});await assert.rejects(f.api.remove('2026-10-31',1),/bekräftas/);assert.equal(f.clears(),0);
 const success=fixture('custom',{ok:true,deleted:true});assert.equal((await success.api.remove('2026-10-31',1)).deleted,true);assert.equal(success.clears(),2);
});
