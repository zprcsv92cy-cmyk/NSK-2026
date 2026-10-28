import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const tick=()=>new Promise(r=>setImmediate(r));
const session=swapped=>({selected:['1','2'],goalies:[],allocation:swapped?[['2'],['1']]:[['1'],['2']]});
function fixture(){
 const docEvents=new Map(),winEvents=new Map(),timers=[];let team='NSK Team 18',token='first',value=session(false),reads=0,read=async()=>({session:value});
 let html='';const panel={hidden:true,get innerHTML(){return html;},set innerHTML(v){html=v;},get textContent(){return html;},set textContent(v){html=v;}};
 const button={disabled:false,setAttribute(){},closest:()=>row};
 const row={open:true,isConnected:true,dataset:{date:'2026-10-29'},querySelector:s=>s==='[data-training-presentation]'?panel:s==='[data-training-colors]'?button:null,matches:s=>s==='details[data-date]'};
 const root={id:'activityList',querySelectorAll:()=>[row]};
 const document={hidden:false,getElementById:id=>id==='activityList'?root:null,addEventListener:(name,fn)=>docEvents.set(name,fn)};
 const window={NSKShellActive:true,addEventListener:(name,fn)=>winEvents.set(name,fn)};
 const context={window,document,setInterval:fn=>timers.push(fn),Auth:{activeTeam:()=>team,getToken:()=>token},SharedTraining:{get:()=>{reads++;return read();},listPlayers:async()=>[{id:1,full_name:'Alpha'},{id:2,full_name:'Beta'}]}};
 vm.runInNewContext(readFileSync(new URL('../training-cards.js',import.meta.url),'utf8'),context);docEvents.get('DOMContentLoaded')();
 return {panel,row,button,document,window,docEvents,winEvents,timers,reads:()=>reads,setSession:s=>value=s,setToken:t=>token=t,setRead:f=>read=f,open:()=>docEvents.get('click')({target:{closest:()=>button}})};
}
test('returning to the calendar refreshes already-open shirt groups after a save',async()=>{
 const f=fixture();await f.open();const before=f.panel.innerHTML;f.setSession(session(true));f.docEvents.get('nsk:page-show')();await tick();
 assert.notEqual(f.panel.innerHTML,before);assert.match(f.panel.innerHTML,/Röd<\/h4><ul><li>Beta/);assert.match(f.panel.innerHTML,/Vit<\/h4><ul><li>Alpha/);assert.equal(f.reads(),2);
});
test('visible open groups refresh on the timer and collapsed or inactive views do not read',async()=>{
 const f=fixture();await f.open();f.setSession(session(true));f.timers[0]();await tick();assert.match(f.panel.innerHTML,/Röd<\/h4><ul><li>Beta/);const reads=f.reads();
 for(const mode of ['closed','inactive','hidden','panel']){f.row.open=mode!=='closed';f.window.NSKShellActive=mode!=='inactive';f.document.hidden=mode==='hidden';f.panel.hidden=mode==='panel';f.timers[0]();await tick();assert.equal(f.reads(),reads);}
});
test('overlapping refreshes share a read and an old identity response cannot replace the panel',async()=>{
 const f=fixture();await f.open();let finish;f.setRead(()=>new Promise(r=>finish=r));f.docEvents.get('nsk:page-show')();f.winEvents.get('focus')();assert.equal(f.reads(),2);
 const before=f.panel.innerHTML;f.setToken('new-session');finish({session:session(true)});await tick();assert.equal(f.panel.innerHTML,before);assert.equal(f.button.disabled,false);
 f.setRead(async()=>({session:session(true)}));f.winEvents.get('focus')();await tick();assert.match(f.panel.innerHTML,/Röd<\/h4><ul><li>Beta/);
});
test('page hide invalidates pending colors and errors replace stale groups with a retry message',async()=>{
 const f=fixture();await f.open();let finish;f.setRead(()=>new Promise(r=>finish=r));f.winEvents.get('focus')();f.winEvents.get('nsk:page-hide')();const before=f.panel.innerHTML;finish({session:session(true)});await tick();assert.equal(f.panel.innerHTML,before);
 f.setRead(async()=>{throw Error('offline');});f.docEvents.get('nsk:page-show')();await tick();assert.match(f.panel.textContent,/Kunde inte uppdatera/);assert.doesNotMatch(f.panel.innerHTML,/Alpha/);
});
