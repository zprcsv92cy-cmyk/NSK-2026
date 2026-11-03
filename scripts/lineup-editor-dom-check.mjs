// Isolated real-page interaction. Synthetic repository adapter; never contacts production.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {JSDOM}=await import(process.env.NSK_JSDOM_MODULE||'jsdom');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const html=read('laguppstallning/index.html');
const clone=value=>JSON.parse(JSON.stringify(value));
test('per-match edits persist, Match 1 fills untouched matches and failed drafts remain editable',async t=>{
 const configs=new Map(),entries=new Map(),writes=[],shiftWrites=[];let failing=false,conflicting=false,closed=false,started=new Set(),deferredCompare=null;
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
  w.DB={getPool:async()=>({active:!closed,teams:1,matches:3,players_on_field:2,periods:1,period_time:2,sub_time:60}),listPlayers:async()=>[1,2,3,4,5].map(id=>({id,full_name:'Player '+id})),listCoaches:async()=>[{id:20,full_name:'Coach'}],listPlayerCoachMap:async()=>[],listPoolMatchPlan:async()=>[1,2,3].map(match_no=>({lag_no:1,match_no})),listPoolTeamMatchConfigs:async()=>clone([...configs.values()]),getPoolTeamMatchConfig:async(_p,_l,m)=>clone(configs.get(String(m))),getLineup:async id=>{if(deferredCompare){const deferred=deferredCompare;deferredCompare=null;await deferred.promise;}return clone(entries.get(id)||[]);},lineupBase:async(config,lineup)=>clone({config,lineup}),listShiftSchema:async(_p,_l,m)=>started.has(String(m))?[{done:true}]:[],saveFullLineup:async(config,players,coaches,base)=>{if(failing)throw Error('Synthetic save failure');if(conflicting)throw Error('Konflikt: laguppställningen har ändrats av en annan användare');assert(base);writes.push(clone({config,players,coaches}));const row={id:100+config.match_no,...config};configs.set(String(config.match_no),row);entries.set(row.id,players.map((person_id,i)=>({id:3000+i,person_type:'player',person_id,sort_order:i+1})));return {base:clone({config:row,lineup:entries.get(row.id)})};},saveCoachSelection:async()=>{},saveShiftSchema:async(_p,_l,m)=>shiftWrites.push(String(m)),saveMatchInfo:async data=>{writes.push({info:data});return {};}};
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
 // A button navigation and a dropdown change in the same tick must not
 // race; the first navigation owns the load until it finishes.
 p.w.document.querySelector('[data-match-no="2"]').click();
 p.change('lineupMatch','3');
 assert.equal(p.$('lineupMatch').value,'1','dropdown restores loaded match while button navigation is pending');
 await p.until(()=>p.$('lineupMatch').value==='2'&&!p.w.__nskLineupLoading&&!p.w.__nskLineupSwitching);
 assert.equal(p.$('lineupPlayer1').value,'2','first navigation loads its own lineup');
 // The same rule applies in reverse: a dropdown change blocks button taps.
 p.change('lineupMatch','1');
 p.w.document.querySelector('[data-match-no="3"]').click();
 await p.until(()=>p.$('lineupMatch').value==='1'&&!p.w.__nskLineupLoading&&!p.w.__nskLineupSwitching);
 assert.equal(p.$('lineupPlayer1').value,'2','dropdown navigation wins over simultaneous button tap');
 assert(p.$('lineupEditButton').compareDocumentPosition(p.$('lineupSelectors'))&p.w.Node.DOCUMENT_POSITION_PRECEDING);
 assert(p.$('lineupPlayer1').disabled);assert(!p.$('lineupEditButton').disabled);assert(p.$('lineupSaveButton').disabled);
 await p.select(2);p.$('lineupEditButton').click();assert(!p.$('lineupPlayer1').disabled);assert(!p.$('lineupSaveButton').disabled);
 // A failed save during navigation must keep both the current match and
 // the user's unsaved choices visible and editable.
 p.change('lineupPlayer1','4');failing=true;
 p.w.document.querySelector('[data-match-no="3"]').click();
 await p.until(()=>!p.w.__nskLineupSwitching);
 assert.equal(p.$('lineupMatch').value,'2','failed navigation must remain on Match 2');
 assert.equal(p.$('lineupPlayer1').value,'4','failed save must preserve draft');
 assert.equal(p.$('lineupPlayer1').disabled,false,'draft remains editable');
 assert.match(p.$('appError').textContent,/Synthetic save failure/);
 failing=false;
 // Re-queue the draft after the first failed save so the next attempt
 // reaches the synthetic concurrent-edit conflict instead of reusing the old failure.
 p.change('lineupPlayer1','4');
 // Simulate another editor changing the same match before this draft saves.
 // A rejected concurrent write must never replace the local draft or switch match.
 conflicting=true;
 p.w.document.querySelector('[data-match-no="3"]').click();
 await p.until(()=>!p.w.__nskLineupSwitching);
 assert.equal(p.$('lineupMatch').value,'2','concurrent conflict keeps current match');
 assert.equal(p.$('lineupPlayer1').value,'4','concurrent conflict preserves local draft');
 assert.equal(p.$('lineupPlayer1').disabled,false,'conflicted draft remains editable');
 assert.match(p.$('appError').textContent,/Konflikt|Sparningen stoppades/);
 assert.match(p.$('appError').textContent,/Kopiera dina val innan du laddar om matchen/,'conflict must not recommend a blind retry');
 assert.match(p.$('lineupMsg').textContent,/Dina val finns kvar här, men är inte sparade/);
 assert.doesNotMatch(p.$('lineupMsg').textContent,/Tryck Spara.*igen/);
 assert.equal(writes.length,0,'conflicted write must not reach persisted state');
 assert.equal(p.$('lineupCompareButton').hidden,false,'comparison is offered after a conflict');
 p.$('lineupCompareButton').click();
 await p.until(()=>/Senast sparat jämfört med dina osparade val/.test(p.$('lineupConflictComparison').textContent));
 assert.match(p.$('lineupConflictComparison').textContent,/1 skillnad hittades/,'comparison summarizes changed fields');
 assert.match(p.$('lineupConflictComparison').textContent,/Spelare 1: sparat/);
 assert.doesNotMatch(p.$('lineupConflictComparison').textContent,/Spelare 2: sparat/,'unchanged fields are omitted');
 assert.match(p.$('lineupConflictComparison').textContent,/dina val/);
 assert.match(p.$('lineupConflictComparison').textContent,/Jämförelsen är endast för läsning/);
 assert.equal(p.$('lineupPlayer1').value,'4','comparison must not discard local draft');
 assert.equal(writes.length,0,'comparison must not write to storage');
 conflicting=false;
 const first=clone(configs.get('1')),third=clone(configs.get('3'));
 p.change('lineupPlayer1','4');await new Promise(r=>setTimeout(r,400));assert.equal(writes.length,0,'manual edit must not save intermediate changes');
 await p.save();assert.match(p.$('lineupMsg').textContent,/sparad för Match 2/);assert(p.$('lineupPlayer1').disabled);assert.deepEqual(writes.map(x=>x.config.match_no),[2]);assert.deepEqual(shiftWrites,['2']);assert.deepEqual(configs.get('1'),first);assert.deepEqual(configs.get('3'),third);
 // A slow comparison from Match 2 must not reappear after navigating to Match 1.
 let releaseCompare;
 deferredCompare={promise:new Promise(resolve=>{releaseCompare=resolve;})};
 p.$('lineupCompareButton').hidden=false;
 p.$('lineupCompareButton').click();
 await p.until(()=>deferredCompare===null);
 await p.select(1);
 releaseCompare();
 await new Promise(r=>setTimeout(r,30));
 assert.equal(p.$('lineupConflictComparison').hidden,true,'stale comparison stays hidden after navigation');
 assert.equal(p.$('lineupConflictComparison').textContent,'','stale comparison must not overwrite the next match');
 // Editing the same match during a slow comparison must also invalidate the result.
 await p.select(2);p.$('lineupEditButton').click();
 let releaseDraftCompare;
 deferredCompare={promise:new Promise(resolve=>{releaseDraftCompare=resolve;})};
 p.$('lineupCompareButton').hidden=false;
 p.$('lineupCompareButton').click();
 await p.until(()=>deferredCompare===null);
 p.change('lineupPlayer1','5');
 releaseDraftCompare();
 await p.until(()=>/Dina val har ändrats under hämtningen/.test(p.$('lineupConflictComparison').textContent));
 assert.equal(p.$('lineupPlayer1').value,'5','draft remains editable after stale comparison');
 assert.equal(p.$('lineupCompareButton').disabled,false,'comparison can be rerun');
 // Discard the comparison-only synthetic draft without triggering a navigation save.
 p.change('lineupPlayer1','4');
 await new Promise(r=>setTimeout(r,450));
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
