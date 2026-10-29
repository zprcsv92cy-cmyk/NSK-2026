import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../person-cards.js',import.meta.url),'utf8');
const skate=readFileSync(new URL('../skate-fields.js',import.meta.url),'utf8');
function fixture(stage,body={ok:true,card:{number:'22'},revision:2}){
 let failing=true,clears=0;const calls=[],controllers=[];
 const context={window:{NSKViewCache:{clear(){clears++;}}},sessionStorage:{removeItem(){clears++;}},Auth:{getToken:()=> 'synthetic-session'},document:{getElementById:()=>null},AbortSignal:{timeout(ms){assert.equal(ms,15000);const c=new AbortController();controllers.push(c);return c.signal;}},fetch:async(url,options)=>{
  calls.push({url,options});const stall=()=>new Promise((resolve,reject)=>{if(!options.signal){reject(Error('Missing deadline'));return;}options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
  if(failing&&stage==='headers')return stall();
  return {ok:true,status:200,json:async()=>{if(failing&&stage==='body')return stall();if(failing&&stage==='invalid')throw new SyntaxError('Invalid JSON');return body;}};
 }};
 vm.runInNewContext(skate+'\n'+source,context);
 return {api:context.window.PersonCards,calls,clears:()=>clears,recover(){failing=false;},async expire(name='TimeoutError'){await new Promise(resolve=>setImmediate(resolve));controllers.at(-1)?.abort(new DOMException('Timed out',name));}};
}
for(const stage of ['headers','body'])test(`a stalled card ${stage} releases the request without retry or cache changes`,async()=>{
 const f=fixture(stage),pending=f.api.save('18','player','101',{number:'22'},1);pending.catch(()=>{});await f.expire();await assert.rejects(pending,/tog för lång tid/);
 assert.equal(f.calls.length,1);assert.equal(f.clears(),0);assert.equal(f.api.summary('18','player','101'),undefined);
 f.recover();const saved=await f.api.save('18','player','101',{number:'22'},1);assert.equal(saved.revision,2);assert.equal(f.clears(),2);assert.equal(f.api.summary('18','player','101').number,'22');
});
test('unreadable and incomplete card confirmations cannot be accepted or cached',async()=>{
 for(const body of [null,{}, {ok:true},{ok:true,card:{}},{ok:true,card:{},revision:-1},{ok:true,card:[],revision:2}]){
  const f=fixture('custom',body);await assert.rejects(f.api.save('18','player','101',{number:'22'},1),/bekräftas|läsas/);assert.equal(f.clears(),0);assert.equal(f.api.summary('18','player','101'),undefined);
 }
 const f=fixture('invalid');await assert.rejects(f.api.save('18','player','101',{},1));assert.equal(f.clears(),0);
});
test('a new material board may have revision zero on a card read',async()=>{
 const f=fixture('custom',{ok:true,card:{number:''},revision:0});assert.equal((await f.api.get('18','player','101')).revision,0);
});
test('the card action releases pending controls and keeps the draft after a timed out save',async()=>{
 const performSource=source.slice(source.indexOf(' async function perform(action)'),source.indexOf(' form.onsubmit='));
 const f=fixture('body'),draft={number:'22'};let message='',updates=0;
 const ui=Function('status','controls',`let current={card:{number:'18'}},pending=false,conflicted=false;${performSource};return {perform,state:()=>({current,pending,conflicted})};`)(text=>message=text,()=>updates++);
 const pending=ui.perform(async()=>{const result=await f.api.save('18','player','101',draft,1);draft.number=result.card.number;});await f.expire();await pending;
 assert.equal(ui.state().pending,false);assert.equal(ui.state().conflicted,true);assert.equal(updates,2);assert.equal(draft.number,'22');assert.match(message,/Läs om kortet med knappen nedan/);assert.equal(f.calls.length,1);
});

test('body aborts use the same recovery path and preserve the uncertain write flag',async()=>{
 const f=fixture('body'),pending=f.api.save('18','player','101',{number:'22'},1);pending.catch(()=>{});await f.expire('AbortError');
 await assert.rejects(pending,error=>error.uncertain===true&&/tog för lång tid/.test(error.message));assert.equal(f.clears(),0);assert.equal(f.calls.length,1);
});
