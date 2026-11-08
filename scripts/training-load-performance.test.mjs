import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const shared=readFileSync(new URL('../shared-training.js',import.meta.url),'utf8');
const home=readFileSync(new URL('../home-training.js',import.meta.url),'utf8');
const loader=home.slice(home.indexOf('  async function loadSessions('),home.indexOf('  async function render('));
test('calendar training list and enrichment start together after one shared team lookup',async()=>{
 const calls=[];let releaseList,releaseCalendar;
 const listGate=new Promise(resolve=>releaseList=resolve),calendarGate=new Promise(resolve=>releaseCalendar=resolve);
 const context={window:{NSKTrainingCards:{enrich:(session,calendar)=>({...session,hall:calendar[0]?.hall})}},Auth:{activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic'},fetch:async url=>{
  calls.push(url);
  if(url.includes('/api/lag'))return {ok:true,json:async()=>({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]})};
  if(url.includes('svenskalag-saved')){await calendarGate;return {ok:true,json:async()=>({items:[{type:'training',hall:'Lilla hallen'}]})};}
  await listGate;return {ok:true,json:async()=>({ok:true,sessions:[{date:'2099-11-09'}]})};
 }};
 vm.runInNewContext(shared,context);context.SharedTraining=context.window.SharedTraining;
 vm.runInNewContext(loader+'this.load=loadSessions;',context);
 const pending=context.load('https://unused.test','synthetic','NSK Team 18');
 try{
  for(let i=0;i<20&&calls.length<3;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.filter(url=>url.includes('/api/lag')).length,1);
  assert.equal(calls.filter(url=>url.includes('/api/training')).length,2,'both requests must start before either finishes');
 }finally{releaseList();releaseCalendar();}
 const result=await pending;assert.equal(result.teamId,'18');assert.equal(result.sessions[0].hall,'Lilla hallen');
});
