import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../auth.js',import.meta.url),'utf8');
const actor=name=>({user:{id:name},memberships:[{team_id:'NSK Team 18',role:'coach'}],permissions:['read']});
function fixture(){
 const values=new Map(),calls=[],timeouts=[];let signedOut=0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const context={window:{APP_CONFIG:{AUTH_URL:'https://auth.test'}},sessionStorage:storage,localStorage:storage,AbortSignal:{timeout(ms){const controller=new AbortController();timeouts.push({ms,controller});return controller.signal;}},fetch:(url,options)=>new Promise((resolve,reject)=>{calls.push({url,options,respond:resolve,resolve:(data,status=200)=>resolve({ok:status<400,json:async()=>data}),reject});options.signal?.addEventListener('abort',()=>reject(options.signal.reason),{once:true});})};
 vm.runInNewContext(source,context);
 context.window.NSKAppShell={signedOut(){signedOut++;}};
 return {auth:context.window.Auth,storage,calls,timeouts,signedOut:()=>signedOut,token:value=>storage.setItem('nsk_user_token',value)};
}
test('late session success after logout cannot restore identity or team selection',async()=>{
 const f=fixture();f.token('old');const pending=f.auth.init();const logout=f.auth.logout();f.calls[1].resolve({});await logout;f.calls[0].resolve(actor('old'));assert.equal(await pending,null);assert.equal(f.auth.getSession(),null);assert.equal(f.auth.activeTeam(),null);assert.equal(f.auth.getToken(),null);
});
test('old success, denial and network failure cannot replace or clear a newer verified identity',async()=>{
 for(const result of ['success','denied','network']){
  const f=fixture();f.token('old');const old=f.auth.init();f.token('new');const current=f.auth.init();f.calls[1].resolve(actor('new'));await current;
  if(result==='network')f.calls[0].reject(Error('offline'));else f.calls[0].resolve(actor('old'),result==='denied'?401:200);
  assert.equal(await old,null);assert.equal(f.auth.getSession().user.id,'new');assert.equal(f.auth.getToken(),'new');
 }
});
test('session changes while the response body is loading also discard the old result',async()=>{
 const f=fixture();f.token('old');let release;const body=new Promise(r=>release=r);const pending=f.auth.init();f.calls[0].respond({ok:true,json:()=>body});await Promise.resolve();
 f.token('new');const current=f.auth.init();f.calls[1].resolve(actor('new'));await current;release(actor('old'));
 assert.equal(await pending,null);assert.equal(f.auth.getSession().user.id,'new');assert.equal(f.auth.getToken(),'new');
});
test('login timeout clears the password, releases the form and never retries automatically',async()=>{
 const f=fixture(),nodes=new Map();let handler;for(const id of ['loginForm','submitButton','message','email','password'])nodes.set(id,{value:id==='email'?'synthetic@example.invalid':id==='password'?'synthetic-password':'',disabled:false,textContent:'',addEventListener(_type,fn){handler=fn;}});
 const access=readFileSync(new URL('../account-access.js',import.meta.url),'utf8');const start=access.indexOf("  $('loginForm').addEventListener('submit'");const end=access.indexOf("  $('forgotOpen')",start);
 Function('$','window','location','destination','let busy=false;'+access.slice(start,end))(id=>nodes.get(id),{Auth:f.auth},{replace(){throw Error('Must not navigate');}},()=>'/');
 const pending=handler({preventDefault(){}});assert.equal(nodes.get('submitButton').disabled,true);assert.equal(f.timeouts[0].ms,15000);assert.equal(f.calls.length,1);
 f.timeouts[0].controller.abort(new DOMException('Timed out','TimeoutError'));await pending;
 assert.equal(nodes.get('submitButton').disabled,false);assert.equal(nodes.get('password').value,'');assert.match(nodes.get('message').textContent,/tog för lång tid/);assert.equal(f.calls.length,1);assert.equal(f.auth.getToken(),null);
});
test('logout informs the shell immediately and a stalled revocation times out without retry',async()=>{
 const f=fixture();f.token('current');const identity=f.auth.init();f.calls[0].resolve(actor('current'));await identity;
 const pending=f.auth.logout();assert.equal(f.auth.getSession(),null);assert.equal(f.auth.getToken(),null);assert.equal(f.signedOut(),1);assert.equal(f.calls[1].options.keepalive,true);assert.equal(f.timeouts.at(-1).ms,5000);
 f.timeouts.at(-1).controller.abort(new DOMException('Timed out','TimeoutError'));await pending;assert.equal(f.calls.length,2);assert.equal(f.signedOut(),1);
});
test('logout network failure and missing session both complete with local credentials cleared',async()=>{
 const f=fixture();f.token('current');f.storage.setItem('nsk_admin_token','obsolete');f.storage.setItem('nsk_match_token','obsolete');const pending=f.auth.logout();f.calls[0].reject(Error('offline'));await pending;
 assert.equal(f.auth.getToken(),null);assert.equal(f.storage.getItem('nsk_admin_token'),null);assert.equal(f.storage.getItem('nsk_match_token'),null);
 await f.auth.logout();assert.equal(f.calls.length,1);assert.equal(f.signedOut(),2);
});
