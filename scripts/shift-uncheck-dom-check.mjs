// Real UI, DB client and production ShiftLock against a synthetic in-memory store.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {ShiftLock} from '../worker/production-api-v42-reference.js';
const {JSDOM}=await import(process.env.NSK_JSDOM_MODULE||'jsdom');
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
test('checking then unchecking really stores false and stale refresh cannot restore the check',async t=>{
 const data=Array.from({length:10},(_,i)=>({id:100+i,Poolspel:[10],Lagnummer:1,Matchnummer:3,Bytenummer:i+1,Periodnummer:1,'Tid kvar':`${String(Math.floor((900-i*90)/60)).padStart(2,'0')}:${String((900-i*90)%60).padStart(2,'0')}`,'Spelare på plan':[2,3,4],Genomfört:false}));
 const writes=[],beforeFetch=globalThis.fetch;let deferredRead=null,delayRead=false;
 globalThis.fetch=async(input,init={})=>{const url=new URL(input),parts=url.pathname.split('/'),table=Number(parts[5]),id=Number(parts[6]);assert.equal(url.origin,'https://api.baserow.io');
  if(table===1255115){const row=data.find(r=>r.id===id);assert(row);if(init.method==='PATCH'){const payload=JSON.parse(init.body);writes.push(payload);Object.assign(row,payload);}return Response.json(row);}
  if(table===1255101)return Response.json({id:10,Lag:[18],'Antal lag':1,Aktiv:true});
  if(table===1255083)return Response.json({id:18,Namn:'NSK Team 18'});
  throw Error('Unexpected synthetic table '+table);
 };
 t.after(()=>{globalThis.fetch=beforeFetch;});
 const lock=new ShiftLock({storage:{get:async()=>undefined}},{BASEROW_TOKEN:'synthetic'});
 async function page(){
  const dom=new JSDOM(read('bytesschema/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{url:'https://isolated.example.test/bytesschema/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window,$=id=>w.document.getElementById(id);
  await new Promise(r=>w.document.addEventListener('DOMContentLoaded',r,{once:true}));
  w.sessionStorage.setItem('nsk2_pool_id','10');w.sessionStorage.setItem('nsk2_lag_nr','1');w.sessionStorage.setItem('nsk2_match_no','3');w.setInterval=()=>0;
  w.Auth={init:async()=>({}),getSession:()=>({user:{id:'synthetic'}}),getToken:()=> 'synthetic'};
  w.fetch=async(input,init)=>{const match=new URL(input).pathname.match(/^\/api\/bytesschema\/(\d+)\/done$/);assert(match);return lock.fetch(new Request('https://isolated.internal/',{method:'POST',body:JSON.stringify({action:'done',id:Number(match[1]),pool_id:10,lag_no:1,match_no:3,...JSON.parse(init.body)})}));};
  w.eval(read('db.js'));
  Object.assign(w.DB,{getPool:async()=>({id:10,active:true,teams:1,matches:3,players_on_field:3,periods:1,period_time:15,sub_time:60}),listPoolMatchPlan:async()=>[1,2,3].map(match_no=>({lag_no:1,match_no})),listPoolTeamMatchConfigs:async()=>[{id:30,lag_no:1,match_no:3,goalie_player_id:1,player_count:3,players_on_field:[1,2,3,4]}],listPlayers:async()=>[1,2,3,4].map(id=>({id,full_name:'Player '+id})),listCoaches:async()=>[],getCoachSelection:async()=>({saved:true,coach_ids:[]}),getPoolMaterial:async()=>({name:'—'}),listShiftSchema:async()=>{const rows=clone(data.map(r=>({id:r.id,shift_no:r.Bytenummer,period_no:r.Periodnummer,time_left:r['Tid kvar'],players_json:r['Spelare på plan'],done:r.Genomfört})));if(delayRead){delayRead=false;await new Promise(resolve=>deferredRead=resolve);}return rows;}});
  w.eval(read('app.js'));await w.NSK2App.init();assert.equal($('appError').textContent,'');
  const check=()=>w.document.querySelector('[data-shift-toggle="1"]');
  async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}throw Error($('shiftMsg').textContent+' '+$('appError').textContent);}
  async function click(){check().click();await until(()=>!check().disabled);}
  return {w,$,check,until,click};
 }
 let p=await page();assert.match(p.$('shiftTableWrap').textContent,/Sparat: 10 byten/);assert.match(p.$('shiftTableWrap').textContent,/Aktuellt: 15 byten/);assert.match(p.$('shiftTableWrap').textContent,/Aktuell bytestid: 60 sekunder/);assert.match(p.$('matchReadiness').textContent,/behöver räknas om/);
 await p.click();assert.equal(data[0].Genomfört,true);assert.match(p.$('shiftMsg').textContent,/markerat som genomfört/);
 delayRead=true;p.w.dispatchEvent(new p.w.Event('focus'));await p.until(()=>deferredRead!==null);
 await p.click();assert.equal(data[0].Genomfört,false);assert.match(p.$('shiftMsg').textContent,/urbockat/);assert.equal(p.check().getAttribute('aria-pressed'),'false');
 deferredRead();await new Promise(r=>setTimeout(r,20));assert.equal(p.check().getAttribute('aria-pressed'),'false');assert(!p.check().classList.contains('done'));assert.equal(data.length,10);assert.deepEqual(writes,[{Genomfört:true},{Genomfört:false}]);
 p.w.close();p=await page();assert.equal(p.check().getAttribute('aria-pressed'),'false');assert.equal(p.$('shiftMsg').textContent,'');assert.match(p.$('shiftTableWrap').textContent,/Sparat: 10 byten/);
});

test('new pool controls default to 15 minutes and 60 seconds',async()=>{
 const dom=new JSDOM(read('skapapoolspel/index.html'),{url:'https://isolated.example.test/skapapoolspel/',runScripts:'outside-only'});
 try{assert.equal(dom.window.document.getElementById('periodTime').value,'15');assert.equal(dom.window.document.getElementById('subTime').value,'60');}
 finally{dom.window.close();}
});
