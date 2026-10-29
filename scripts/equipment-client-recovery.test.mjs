import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../equipment.js',import.meta.url),'utf8');
function fixture({stage,body,status=200}={}){
 let token='session-a',activeTeam='NSK Team 18',failing=true;const calls=[],controllers=[],nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,replaceChildren(){}});return nodes.get(id);};
 const initial={revision:1,requests:[],checklists:[]};
 const context={window:{},document:{getElementById:node,querySelectorAll:()=>[]},structuredClone,Auth:{init:async()=>{},getToken:()=>token,activeTeam:()=>activeTeam},AbortSignal:{timeout(ms){assert.equal(ms,15000);const c=new AbortController();controllers.push(c);return c.signal;}},fetch:async(url,options)=>{
  calls.push({url,options});const stall=()=>new Promise((resolve,reject)=>{if(!options.signal){reject(Error('Missing deadline'));return;}options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
  if(failing&&stage==='headers')return stall();
  return {ok:status<400,status,json:async()=>{if(failing&&stage==='body')return stall();if(stage==='invalid')throw new SyntaxError('Invalid JSON');return url.endsWith('/api/lag')?{results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]}:body===undefined?{ok:true,canWrite:false,revision:2,requests:[],checklists:[]}:body;}};
 }};
 const prefix=source.slice(0,source.indexOf(' function row('))+source.slice(source.indexOf(' async function load(){'),source.indexOf(' for(const button of document.querySelectorAll'));
 vm.runInNewContext(prefix+`team='18';teamName='NSK Team 18';board=${JSON.stringify(initial)};canWrite=true;render=()=>{};window.testing={request,change,load,state:()=>({board,busy,canWrite})};})();`,context);
 return {api:context.window.testing,calls,node,token:value=>token=value,activeTeam:value=>activeTeam=value,recover(){failing=false;},async expire(){await new Promise(resolve=>setImmediate(resolve));controllers.at(-1)?.abort(new DOMException('Timed out','TimeoutError'));}};
}
for(const stage of ['headers','body'])test(`stalled equipment ${stage} releases save and reload controls without retry`,async()=>{
 const f=fixture({stage}),pending=f.api.change(b=>b.requests.push({id:'draft'}));await f.expire();assert.equal(await pending,false);
 assert.equal(f.api.state().busy,false);assert.equal(f.node('equipmentReload').disabled,false);assert.equal(f.api.state().board.revision,1);assert.equal(f.calls.length,1);assert.match(f.node('equipmentStatus').textContent,/tog för lång tid/);assert.doesNotMatch(f.node('equipmentStatus').textContent,/^Sparat/);
 f.recover();assert.equal(await f.api.change(()=>{}),true);assert.equal(f.api.state().board.revision,2);
});
test('successful HTTP responses require complete material data before confirming a save',async()=>{
 for(const body of [null,{}, {ok:true},{ok:true,revision:2,requests:[]},{ok:true,revision:2,requests:{},checklists:[]},{ok:true,revision:-1,requests:[],checklists:[]}]){
  const f=fixture({body});assert.equal(await f.api.change(()=>{}),false);assert.equal(f.api.state().board.revision,1);assert.equal(f.api.state().busy,false);assert.match(f.node('equipmentStatus').textContent,/bekräftas/);
 }
 const f=fixture({stage:'invalid'});assert.equal(await f.api.change(()=>{}),false);assert.equal(f.api.state().board.revision,1);
});
test('a replaced session or team cannot apply a delayed material response',async()=>{
 for(const change of ['session','team']){
  const f=fixture();const pending=f.api.request();if(change==='session')f.token('session-b');else f.activeTeam('Other team');
  await assert.rejects(pending,/ändrades/);
 }
});
test('material conflicts retain their status and disable further writes until reload',async()=>{
 const f=fixture({status:409,body:{ok:false,error:'Läs om'}});await assert.rejects(f.api.request({}),error=>error.status===409);assert.equal(f.api.state().canWrite,false);
});

test('a stalled initial team lookup releases reload and allows a later load',async()=>{
 const f=fixture({stage:'body'}),pending=f.api.load();await f.expire();await pending;
 assert.equal(f.api.state().busy,false);assert.equal(f.node('equipmentReload').disabled,false);assert.match(f.node('equipmentStatus').textContent,/tog för lång tid/);assert.equal(f.calls.length,1);
 f.recover();await f.api.load();assert.equal(f.api.state().board.revision,2);assert.match(f.node('equipmentStatus').textContent,/Uppdaterat/);
});
test('a session change during a save clears the old board instead of restoring it',async()=>{
 const f=fixture(),pending=f.api.change(()=>{});f.token('session-b');assert.equal(await pending,false);assert.equal(f.api.state().board,null);assert.equal(f.api.state().canWrite,false);assert.equal(f.api.state().busy,false);
});
test('an empty material board with revision zero remains readable',async()=>{
 const f=fixture({body:{ok:true,revision:0,requests:[],checklists:[]}});assert.equal((await f.api.request()).revision,0);
});
