// Isolated real-page interaction. Synthetic repository adapter; never contacts production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {JSDOM}=await import(process.env.NSK_JSDOM_MODULE||'jsdom');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('laguppstallning/index.html');
const clone=value=>JSON.parse(JSON.stringify(value));
test('per-match edits persist, Match 1 fills untouched matches and failed drafts remain editable',async t=>{
 const configs=new Map(),entries=new Map(),writes=[],shiftWrites=[];let failing=false,closed=false,started=new Set();
 for(let n=1;n<=3;n++){
  configs.set(String(n),{id:100+n,lag_no:1,match_no:n,goalie_player_id:1,player_count:2,start_time:'10:0'+n,opponent:'Opponent '+n,plan:'Plan 1'});
  entries.set(100+n,[{id:1000+n,person_type:'player',person_id:2,sort_order:1},{id:2000+n,person_type:'player',person_id:3,sort_order:2}]);
 }
 async function page(match='1'){
  const dom=new JSDOM(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://isolated.example.test/laguppstallning/',runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>dom.window.close());const w=dom.window,$=id=>w.document.getElementById(id);
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  w.sessionStorage.setItem('nsk2_pool_id','10');w.sessionStorage.setItem('nsk2_lag_nr','1');w.sessionStorage.setItem('nsk2_match_no',match);
  w.Auth={init:async()=>({}),isLoggedIn:()=>true};w.setInterval=()=>0;
  w.DB={getPool:async()=>({active:!closed,teams:1,matches:3,players_on_field:2,periods:1,period_time:2,sub_time:60}),listPlayers:async()=>[1,2,3,4,5].map(id=>({id,full_name:'Player '+id})),listCoaches:async()=>[{id:20,full_name:'Coach'}],listPlayerCoachMap:async()=>[],listPoolMatchPlan:async()=>[1,2,3].map(match_no=>({lag_no:1,match_no})),listPoolTeamMatchConfigs:async()=>clone([...configs.values()]),getPoolTeamMatchConfig:async(_p,_l,m)=>clone(configs.get(String(m))),getLineup:async id=>clone(entries.get(id)||[]),lineupBase:async(config,lineup)=>clone({config,lineup}),listShiftSchema:async(_p,_l,m)=>started.has(String(m))?[{done:true}]:[],saveFullLineup:async(config,players,coaches,base)=>{if(failing)throw Error('Synthetic save failure');assert(base);writes.push(clone({config,players,coaches}));const row={id:100+config.match_no,...config};configs.set(String(config.match_no),row);entries.set(row.id,players.map((person_id,i)=>({id:3000+i,person_type:'player',person_id,sort_order:i+1})));return {base:clone({config:row,lineup:entries.get(row.id)})};},saveCoachSelection:async()=>{},saveShiftSchema:async(_p,_l,m)=>shiftWrites.push(String(m)),saveMatchInfo:async data=>{writes.push({info:data});return {};}};
  // Run the existing coach picker as packaged, including its disabled state.
  const picker=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).find(s=>s.includes('// Tryckbara knappar'));
  w.eval(picker);w.eval(read('app.js'));await w.NSK2App.init();
  assert.equal($('appError').textContent,'');
  const change=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
  const tick=()=>new Promise(r=>setTimeout(r,10));
  async function until(check){for(let i=0;i<100;i++){if(check())return;await tick();}throw Error($('appError').textContent||$('lineupMsg').textContent||'Wait failed');}
  async function save(){ $('lineupSaveButton').click();await until(()=>!w.__nskLineupSaving);}
  async function select(n){w.document.querySelector('[data-match-no="'+n+'"]').click();await until(()=>$('lineupMatch').value===String(n)&&!w.__nskLineupLoading);}
  return {w,$,change,save,select,until};
 }
 let p=await page();
 assert(p.$('lineupEditButton').compareDocumentPosition(p.$('lineupSelectors'))&p.w.Node.DOCUMENT_POSITION_PRECEDING);
 assert(p.$('lineupPlayer1').disabled);assert(!p.$('lineupEditButton').disabled);assert(p.$('lineupSaveButton').disabled);
 await p.select(2);p.$('lineupEditButton').click();assert(!p.$('lineupPlayer1').disabled);assert(!p.$('lineupSaveButton').disabled);
 const first=clone(configs.get('1')),third=clone(configs.get('3'));
 p.change('lineupPlayer1','4');await new Promise(r=>setTimeout(r,400));assert.equal(writes.length,0,'manual edit must not save intermediate changes');
 await p.save();assert.match(p.$('lineupMsg').textContent,/sparad för Match 2/);assert(p.$('lineupPlayer1').disabled);assert.deepEqual(writes.map(x=>x.config.match_no),[2]);assert.deepEqual(shiftWrites,['2']);assert.deepEqual(configs.get('1'),first);assert.deepEqual(configs.get('3'),third);
 await p.select(1);assert.equal(p.$('lineupPlayer1').value,'2');await p.select(2);assert.equal(p.$('lineupPlayer1').value,'4');
 p.w.close();p=await page('2');assert.equal(p.$('lineupPlayer1').value,'4');
 p.$('lineupEditButton').click();p.change('lineupPlayer1','5');failing=true;await p.save();assert.match(p.$('appError').textContent,/Synthetic save failure/);assert.equal(p.$('lineupPlayer1').value,'5');assert(!p.$('lineupPlayer1').disabled);assert(!p.$('lineupSaveButton').disabled);assert.equal(writes.length,1);
 failing=false;await p.save();assert.equal(entries.get(102)[0].person_id,5);assert(p.$('lineupPlayer1').disabled);
 // An incomplete edit stays open and identifies the missing positions.
 p.$('lineupEditButton').click();p.change('lineupPlayer1','');await p.save();assert(!p.$('lineupPlayer1').disabled);assert.match(p.$('lineupMsg').textContent,/Fyll alla spelarplatser/);p.change('lineupPlayer1','4');await p.save();
 p.w.close();started.add('2');p=await page('2');p.$('lineupEditButton').click();assert(p.$('lineupPlayer1').disabled);assert(!p.$('lineupOpponent').disabled);assert.match(p.$('lineupEditStatus').textContent,/låsta efter matchstart/);
 p.w.close();closed=true;p=await page('2');assert(p.$('lineupEditButton').disabled);assert(p.$('lineupSaveButton').disabled);assert(p.$('lineupPlayer1').disabled);assert.match(p.$('lineupEditStatus').textContent,/avslutat/);
 p.w.close();closed=false;started.clear();configs.set('3',{id:103,lag_no:1,match_no:3,opponent:'Opponent 3'});entries.set(103,[]);
 p=await page('1');p.$('lineupEditButton').click();p.change('lineupPlayer1','5');const before=writes.length,manualSecond=clone(entries.get(102));await p.save();assert.equal(writes.length,before+2);assert.deepEqual(writes.slice(before).map(x=>x.config.match_no),[1,3]);assert.equal(entries.get(103)[0].person_id,5);assert.deepEqual(clone(entries.get(102)),manualSecond,'separately edited Match 2 keeps its players');assert.equal(configs.get('3').opponent,'Opponent 3');
 await p.select(3);assert.equal(p.$('lineupPlayer1').value,'5');assert.doesNotMatch(p.$('lineupMsg').textContent,/Tryck Spara för att använda/);p.w.close();p=await page('3');assert.equal(p.$('lineupPlayer1').value,'5');
});
