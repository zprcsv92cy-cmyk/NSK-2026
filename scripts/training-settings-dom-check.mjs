// Real page controls -> shared HTTP client -> authorized handler -> isolated SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {createTrainingHandler} from '../worker/training-sessions-api.js';
import {withConcurrentResources} from '../worker/concurrent-resources.js';
import {trainingSnapshot,mergeTraining} from '../concurrency-merge.mjs';
const {JSDOM}=await import(pathToFileURL(process.env.NSK_JSDOM_MODULE));
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('shirt edits and two unnamed keepers survive reload, later naming and another user reading',async t=>{
 const f=await fixture(t);
 for(const file of ['20261022_training_sessions.sql','20261023_training_hall_colors.sql'])for(const sql of read('migrations/'+file).split(';').filter(s=>s.trim()))await f.db.prepare(sql).run();
 await f.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(f.root,'lineup:edit').run();
 const env={...f.env,NSK_MULTIUSER_ENABLED:'true'},teams=[{id:18,Namn:'NSK Team 18','Säsong':'2026'}];
 const handler=withConcurrentResources(createTrainingHandler(env,async()=>teams));
 const url='https://test.invalid/api/training?team_id=18&date=2026-11-02';
 const call=(method,body,token=f.tokens.root)=>handler(new Request(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 const initial={...trainingSnapshot(),selected:['1','2','3','4'],allocation:[['1','4'],['2'],['3']]};
 assert.equal((await call('PUT',{...initial,revision:0,base:{session:trainingSnapshot()}})).status,200);
 async function page(){
  const dom=new JSDOM(read('traningsgrupper/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://test.invalid/traningsgrupper/?date=2026-11-02&edit=colors',runScripts:'outside-only'});
  t.after(()=>dom.window.close());const w=dom.window;
  await new Promise(resolve=>w.document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  w.structuredClone=structuredClone;w.AbortSignal=AbortSignal;w.setInterval=()=>0;
  w.Auth={init:async()=>({memberships:[{team_id:'NSK Team 18'}]}),activeTeam:()=> 'NSK Team 18',getToken:()=>f.tokens.root};
  w.fetch=async(input,options)=>{
   const target=new URL(input);
   if(target.pathname==='/api/lag')return Response.json({results:teams});
   if(target.pathname==='/api/training')return handler(new Request(input,options),env);
   throw Error('Unexpected request: '+input);
  };
  w.eval(read('shared-training.js'));
  Object.assign(w.SharedTraining,{snapshotSession:async data=>trainingSnapshot(data),mergeDraft:async(b,d,c)=>mergeTraining(b,d,c,true),listPlayers:async()=>['1','2','3','4','5'].map(id=>({id,full_name:'Player '+id})),listCoaches:async()=>[],listEquipment:async()=>[],calendarTrainings:async()=>[],calendarHall:async()=>''});
  w.eval(read('training-groups.js'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const get=id=>w.document.getElementById(id);
  async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error(get('trainingStatus').textContent);}
  await until(()=>get('trainingRoster').children.length===5);
  const change=(node,value)=>{node.value=value;node.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const save=async()=>{get('trainingSaveColors').click();await until(()=>!get('trainingSaveColors').disabled);assert.match(get('trainingColorStatus').textContent,/Tröjfärger sparade/);};
  return {w,get,change,save};
 }
 let p=await page();
 p.change(p.get('trainingGoalieCount'),'2');
 p.change(p.get('trainingShirtColorCount'),'4');
 let choose=p.w.document.querySelector('[aria-label="Flytta Player 1 till tröjfärg"]');p.change(choose,'3');
 await p.save();
 let saved=(await(await call('GET')).json()).session;
 assert.equal(saved.goalieCount,2);assert.deepEqual(saved.goalies,[]);assert.equal(saved.shirtColorCount,4);assert.deepEqual(saved.allocation,[['4'],['2'],['3'],['1']]);
 p.w.close();p=await page();
 assert.equal(p.get('trainingGoalieCount').value,'2');assert.equal(p.get('trainingShirtColorCount').value,'4');assert.equal(p.get('trainingGoalies').querySelectorAll('select').length,2);
 assert.match(p.get('trainingGoalieSummary').textContent,/2 ej namngivna/);
 // Adding an attendee must preserve the two unnamed places.
 const fifth=p.get('trainingRoster').querySelectorAll('input')[4];fifth.checked=true;fifth.dispatchEvent(new p.w.Event('change',{bubbles:true}));await p.save();assert.equal(p.get('trainingGoalieCount').value,'2');
 // Choosing the second selector first must not move it to the first selector.
 p.change(p.get('trainingGoalies').querySelectorAll('select')[1],'2');await p.save();
 assert.equal(p.get('trainingGoalies').querySelectorAll('select')[0].value,'');assert.equal(p.get('trainingGoalies').querySelectorAll('select')[1].value,'2');
 fifth.checked=false;fifth.dispatchEvent(new p.w.Event('change',{bubbles:true}));await p.save();
 assert.equal(p.get('trainingGoalieCount').value,'2');assert.equal(p.get('trainingGoalies').querySelectorAll('select')[1].value,'2');
 fifth.checked=true;fifth.dispatchEvent(new p.w.Event('change',{bubbles:true}));await p.save();
 p.change(p.get('trainingGoalies').querySelectorAll('select')[0],'1');await p.save();
 saved=(await(await call('GET','',f.tokens.user)).json()).session;
 assert.equal(saved.goalieCount,2);assert.deepEqual(saved.goalies,['1','2']);assert(!saved.allocation.flat().includes('1'));assert(!saved.allocation.flat().includes('2'));
 // Both names can be cleared again without losing the configured count.
 for(let i=0;i<2;i++){p.change(p.get('trainingGoalies').querySelectorAll('select')[i],'');await p.save();}
 saved=(await(await call('GET')).json()).session;assert.equal(saved.goalieCount,2);assert.deepEqual(saved.goalies,[]);assert.equal(saved.allocation.flat().length,5);
 const denied=await call('PUT',{...trainingSnapshot(saved),shirtColorCount:2,revision:saved.revision,base:{session:trainingSnapshot(saved)}},f.tokens.user);assert.equal(denied.status,403);
 p.w.eval(read('training-cards.js'));const html=p.w.NSKTrainingCards.presentation(saved,['1','2','3','4','5'].map(id=>({id,full_name:'Player '+id})));
 assert.match(html,/2 ej namngivna/);assert.match(html,/Grön/);
 p.w.close();p=await page();assert.equal(p.get('trainingGoalieCount').value,'2');assert.equal(p.get('trainingShirtColorCount').value,'4');
});
