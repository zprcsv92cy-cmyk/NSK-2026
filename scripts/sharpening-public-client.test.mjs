import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../sharpening-public.js',import.meta.url),'utf8');
const data=(status='none',revision=1)=>({ok:true,revision,firstName:'Synthetic',number:'18',mode:'parent',pairs:[{key:'regular',label:'Ordinarie skridskor',settings:{hollow:'17 mm',profile:'',model:'',notes:''},status,history:[],noteRequired:false,nextRegularAt:null}]});
function fixture({stage,body,initial=data()}={}){
 const nodes=new Map(),calls=[],controllers=[];let failing=true;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='requestPair'?'regular':'',children:[],dataset:{},get options(){return this.children;},replaceChildren(){this.children=[];},append(child){this.children.push(child);if(!this.value&&child.value)this.value=child.value;},focus(){}});return nodes.get(id);};
 const context={window:{APP_CONFIG:{API_URL:'https://api.example.test'}},location:{hash:'#nyckel='+ 'ab'.repeat(32)},document:{getElementById:node,querySelectorAll:()=>[...nodes.values()],createElement:()=>({append(){}})},URLSearchParams,Option:class{constructor(text,value){this.textContent=text;this.value=value;}},AbortSignal:{timeout(ms){assert.equal(ms,15000);const c=new AbortController();controllers.push(c);return c.signal;}},fetch:async(url,options)=>{
  calls.push({url,options});const stall=()=>new Promise((resolve,reject)=>{if(!options.signal){reject(Error('Missing deadline'));return;}options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true});});
  if(failing&&stage==='headers')return stall();return {ok:true,status:200,json:async()=>{if(failing&&stage==='body')return stall();if(stage==='invalid')throw new SyntaxError('Bad JSON');return body===undefined?data(options.method==='POST'?'pending':'none',options.method==='GET'?1:2):body;}};
 }};
 node('refreshStatus');
 vm.runInNewContext(source.slice(0,source.indexOf(" document.addEventListener('DOMContentLoaded'"))+`window.testing={update,render,state:()=>({state,busy,editing}),edit:()=>{editing=true;paint();}};})();`,context);
 context.window.testing.render(initial);node('requestNote').value='Keep this message';
 return {api:context.window.testing,node,calls,recover(){failing=false;},async expire(){await new Promise(resolve=>setImmediate(resolve));controllers.at(-1)?.abort(new DOMException('Timed out','TimeoutError'));}};
}
for(const stage of ['headers','body'])test(`a stalled public ${stage} preserves the message and releases controls without resubmitting`,async()=>{
 const f=fixture({stage}),pending=f.api.update('POST',{note:'Keep this message',pair:'regular'});await f.expire();await pending;
 assert.equal(f.api.state().busy,false);assert.equal(f.node('refreshStatus').disabled,false);assert.equal(f.node('requestNote').value,'Keep this message');assert.equal(f.calls.length,1);assert.match(f.node('pageMessage').textContent,/tog för lång tid/);
 f.recover();await f.api.update();assert.equal(f.calls.length,2);assert.equal(f.calls[1].options.method,'GET');assert.equal(f.node('requestNote').value,'Keep this message');
});
test('malformed successful responses cannot replace the last valid public state',async()=>{
 for(const body of [null,{ok:true},{...data(),pairs:null},{...data(),pairs:[{...data().pairs[0],settings:null}]},{...data(),pairs:[{...data().pairs[0],history:null}]}]){
  const f=fixture({body}),before=f.api.state().state;await f.api.update('POST',{note:'Keep this message',pair:'regular'});
  assert.equal(f.api.state().state,before);assert.equal(f.api.state().busy,false);assert.equal(f.node('requestNote').value,'Keep this message');assert.match(f.node('pageMessage').textContent,/bekräftas/);
 }
});
test('a slip request requires confirmed pending status before clearing its message',async()=>{
 const failed=fixture({body:data('none',2)});await failed.api.update('POST',{note:'Keep this message',pair:'regular'});assert.equal(failed.node('requestNote').value,'Keep this message');assert.match(failed.node('pageMessage').textContent,/bekräftas/);
 const success=fixture();await success.api.update('POST',{note:'Keep this message',pair:'regular'});assert.equal(success.node('requestNote').value,'');assert.match(success.node('pageMessage').textContent,/finns nu hos materialförvaltaren/);assert.equal(success.api.state().state.pairs[0].status,'pending');
});
test('an unconfirmed skate edit keeps editing open and requires a newer revision',async()=>{
 const f=fixture({body:data('none',1)});f.api.edit();await f.api.update('PUT',{revision:1,pair:'regular',settings:{hollow:'20 mm'}});
 assert.equal(f.api.state().editing,true);assert.equal(f.node('skateEditForm').hidden,false);assert.equal(f.api.state().state.pairs[0].settings.hollow,'17 mm');assert.match(f.node('pageMessage').textContent,/bekräftas/);
 const success=fixture();success.api.edit();await success.api.update('PUT',{revision:1,pair:'regular',settings:{hollow:'20 mm'}});assert.equal(success.api.state().editing,false);assert.match(success.node('pageMessage').textContent,/är sparade/);
});

test('invalid JSON keeps the current public state and the draft message',async()=>{
 const f=fixture({stage:'invalid'}),before=f.api.state().state;await f.api.update('POST',{note:'Keep this message',pair:'regular'});assert.equal(f.api.state().state,before);assert.equal(f.node('requestNote').value,'Keep this message');assert.equal(f.api.state().busy,false);assert.match(f.node('pageMessage').textContent,/bekräftas/);
});
test('requesting both pairs requires confirmation for both independent requests',async()=>{
 const both=(regular,goalie)=>{const result=data(regular,2);result.pairs.push({...data(goalie).pairs[0],key:'goalie',label:'Målvaktsskridskor'});return result;};
 const failed=fixture({initial:both('none','none'),body:both('pending','none')});await failed.api.update('POST',{note:'Keep this message',pair:'both'});assert.equal(failed.node('requestNote').value,'Keep this message');assert.match(failed.node('pageMessage').textContent,/bekräftas/);
 const success=fixture({initial:both('none','none'),body:both('pending','pending')});await success.api.update('POST',{note:'Keep this message',pair:'both'});assert.equal(success.node('requestNote').value,'');assert(success.api.state().state.pairs.every(p=>p.status==='pending'));
});
