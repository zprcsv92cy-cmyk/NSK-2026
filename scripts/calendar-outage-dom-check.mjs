// Exercise the real calendar renderer with failing optional match summaries.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {reconcileCalendarPools} from '../calendar-pool-reconcile.mjs';
const {JSDOM}=await import(process.env.NSK_JSDOM_MODULE||'jsdom');
test('calendar alias consolidation and removal work while optional match summaries return 503',async()=>{
 const dom=new JSDOM('<div id="svenskalagSavedEvents"></div><div id="savedPoolsList"><section class="pool-overview-section"><h2>Kommande</h2></section><section class="pool-overview-section"><h2>Avslutade</h2></section></div>',{url:'https://isolated.example.test/startsida/',runScripts:'outside-only'});const w=dom.window;
 try{
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  const keys=['pool:ev','pool:smehallen','swehockey-pool:1'],date='2099-11-08',matches=[{opponent:'Test A',startTime:'12:00'},{opponent:'Test B',startTime:'13:00'}];let hidden=false,writes=[];
  const items=()=>keys.map((key,i)=>({key,type:'pool',date,place:i===0?'EV inställd':'Smehallen B',hall:'',source:i===2?'swehockey':'svenskalag',sourceKeys:keys,manualSchedule:true,manualScheduleRevision:3,matches,calendarHidden:hidden}));
  w.Auth={init:async()=>({}),activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic'};w.DB={listPools:async()=>[{id:1,pool_date:date,hall:'Stora Hallen',place:'Nyköping'}],listPoolMatchSummaries:async()=>{throw Error('Synthetic API 503');}};
  w.confirm=()=>true;w.alert=message=>assert.fail(message);w.nskVersionRoot=()=>new URL('https://isolated.example.test/');w.nskPoolWeekday=()=> 'Söndag';w.nskPoolGathering=()=> 'Samling kl 11:00';w.TestCalendar={reconcileCalendarPools};
  w.fetch=async(input,options={})=>{const url=new URL(input);if(url.pathname==='/api/lag')return Response.json({results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]});if(url.searchParams.get('action')==='calendar-pool-visibility'){writes.push(JSON.parse(options.body));hidden=true;return Response.json({ok:true});}if(url.searchParams.get('action')==='changing-rooms')return Response.json({bookings:[]});return Response.json({items:items()});};
  const source=readFileSync(new URL('../svenskalag-home.js',import.meta.url),'utf8').replace("await import(new URL('calendar-pool-reconcile.mjs?v='+encodeURIComponent(window.NSK_VERSION||'1'),nskVersionRoot()).href)",'window.TestCalendar');w.eval(source);
  const active=()=>w.document.querySelectorAll('.pool-overview-section')[0],archived=()=>w.document.querySelectorAll('.pool-overview-section')[1];
  async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error(w.document.body.textContent);}
  await until(()=>active().querySelectorAll('details').length===1);assert.match(active().textContent,/Smehallen/);assert.doesNotMatch(active().querySelector('summary').textContent,/EV inställd/);
  [...active().querySelectorAll('button')].find(b=>b.textContent==='Ta bort').click();await until(()=>archived().querySelectorAll('details').length===1);assert.equal(active().querySelectorAll('details').length,0);assert.deepEqual(writes[0].keys.sort(),keys.sort());assert.equal(writes[0].hidden,true);
 }finally{w.close();}
});
