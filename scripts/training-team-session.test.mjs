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

function responseFixture(changeStage,changeKind){
 let token='session-a',team='NSK Team 18',clears=0;const calls=[];
 const change=()=>{if(changeKind==='team')team='Other team';else token='session-b';};
 const context={window:{NSKViewCache:{clear(){clears++;}}},sessionStorage:{removeItem(){clears++;}},Auth:{activeTeam:()=>team,getToken:()=>token},fetch:async(url,options)=>{
  calls.push({url,method:options.method||'GET',token:options.headers.Authorization});
  if(url.endsWith('/api/lag'))return {ok:true,json:async()=>({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]})};
  if(changeStage==='response')change();
  return {ok:true,json:async()=>{if(changeStage==='body')change();return {ok:true,session:{},results:[{id:1,Namn:'Test',Lag:[18],role:'equipment',name:'Test'}],next:true,items:[{type:'training',date:'2026-10-31',hall:'Stora hallen'}]};}};
 }};
 vm.runInNewContext(source,context);
 return {api:context.window.SharedTraining,calls,clears:()=>clears};
}
for(const stage of ['response','body'])test(`training operations discard stale ${stage} after a session or team change`,async()=>{
 for(const kind of ['session','team'])for(const [operation,args] of [['get',['2026-10-31']],['save',['2026-10-31',{selected:[]}]],['remove',['2026-10-31',1]],['listPlayers',[]],['listCoaches',[]],['listEquipment',[]],['calendarTrainings',[]],['calendarHall',['2026-10-31']]]){
  const f=responseFixture(stage,kind);
  await assert.rejects(f.api[operation](...args),/ändrades/,`${operation}: ${kind} changed during ${stage}`);
  assert.equal(f.clears(),0,'stale response must not invalidate the new session cache');
  assert.equal(f.calls.length,2,'stale paginated reads must stop before requesting the next page');
 }
});
test('a session change while resuming a cached team lookup blocks writes before dispatch',async()=>{
 const f=fixture();await f.api.get('2026-10-31');const before=f.calls.length;
 const pending=f.api.save('2026-10-31',{selected:[]});f.token('session-b');
 await assert.rejects(pending,/ändrades/);assert.equal(f.calls.length,before);
});
