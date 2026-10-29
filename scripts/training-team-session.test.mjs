import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../shared-training.js',import.meta.url),'utf8');
function fixture(){
 let token='session-a',team='NSK Team 18',gate=null;const calls=[];
 const context={window:{},Auth:{activeTeam:()=>team,getToken:()=>token},fetch:async(url,options)=>{calls.push({url,token:options.headers.Authorization});if(url.includes('/api/lag')){if(gate)await gate;return {ok:true,json:async()=>({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]})};}return {ok:true,json:async()=>({ok:true,session:{}})};}};
 vm.runInNewContext(source,context);
 return {api:context.window.SharedTraining,calls,token:value=>token=value,team:value=>team=value,pause(){let release;gate=new Promise(r=>release=r);return release;}};
}
test('team lookup is reused within a session but reverified for a new session',async()=>{
 const f=fixture();await f.api.get('2026-10-31');await f.api.get('2026-10-31');assert.equal(f.calls.filter(c=>c.url.includes('/api/lag')).length,1);
 f.token('session-b');await f.api.get('2026-10-31');assert.equal(f.calls.filter(c=>c.url.includes('/api/lag')).length,2);assert.equal(f.calls.at(-1).token,'Bearer session-b');
 f.token(null);const before=f.calls.length;await assert.rejects(f.api.get('2026-10-31'),/Logga in/);assert.equal(f.calls.length,before);
});
test('a session or team change during lookup blocks the dependent training write',async()=>{
 for(const change of ['session','team']){
  const f=fixture(),release=f.pause();const pending=f.api.save('2026-10-31',{selected:[]});
  if(change==='session')f.token('session-b');else f.team('Other team');release();
  await assert.rejects(pending,/ändrades/);assert.equal(f.calls.length,1);assert(f.calls[0].url.includes('/api/lag'));
 }
});
test('overlapping reads share their team lookup',async()=>{
 const f=fixture(),release=f.pause();const a=f.api.get('2026-10-31'),b=f.api.get('2026-11-01');release();await Promise.all([a,b]);assert.equal(f.calls.filter(c=>c.url.includes('/api/lag')).length,1);
});
