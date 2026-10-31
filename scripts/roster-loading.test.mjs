import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('  async function initTruppenPage() {'),app.indexOf('  async function initGoalieStatsPage() {'));
function fixture({invalid=0,fail=false,denied=false}={}){
 let reads=0,opens=0,paintedPlayers=[],paintedCoaches=[],refreshes=0,cleared=0;
 const nodes=new Map(['playersList','coachesList','truppenMsg'].map(id=>[id,{textContent:'',addEventListener(){},replaceChildren(){this.cleared=true;}}]));
 const button={hidden:false,addEventListener(name,fn){this[name]=fn;}};nodes.get('truppenMsg').after=()=>{};
 const cache={players:null,coaches:null};
 const viewCache={open:async()=>{const n=++opens;return {data:null,current:()=>n>invalid,save(){}};},denied:()=>denied,clear(){cleared++;}};
 const context={window:{NSKViewCache:viewCache,Auth:{init:async()=>{refreshes++;}},dispatchEvent(){},addEventListener(){}},NSKViewCache:viewCache,document:{body:{dataset:{}},createElement:()=>button},CustomEvent:class{},byId:id=>nodes.get(id),setText:(id,text)=>{nodes.get(id).textContent=text;},rosterCache:cache,renderPlayers:async()=>{paintedPlayers=cache.players;},renderCoaches:async()=>{paintedCoaches=cache.coaches;},clearRosterCache(){cache.players=cache.coaches=null;},DB:{listPlayers:async()=>{reads++;if(fail)throw Error('network');return [{id:1}];},listCoaches:async()=>[{id:2}]},truppenRealtime:null};
 vm.runInNewContext(source+';this.run=initTruppenPage;',context);
 return {run:context.run,nodes,button,context,get reads(){return reads;},get refreshes(){return refreshes;},get painted(){return [paintedPlayers,paintedCoaches];},get cleared(){return cleared;},recover(){fail=false;}};
}
test('roster retries an invalidated identity snapshot and renders players and coaches',async()=>{
 const f=fixture({invalid:1});await f.run();assert.equal(f.reads,2);assert.equal(f.refreshes,1);assert.deepEqual(f.painted,[[{id:1}],[{id:2}]]);assert.equal(f.nodes.get('truppenMsg').textContent,'');assert.equal(f.context.document.body.dataset.rosterLoading,'false');assert.equal(f.button.hidden,true);
});
test('repeatedly invalidated reads show an actionable error instead of silently leaving zero rows',async()=>{
 const f=fixture({invalid:10});await f.run();assert.equal(f.reads,3);assert.equal(f.button.hidden,false);assert.match(f.nodes.get('truppenMsg').textContent,/Inloggningen ändrades/);assert.deepEqual(f.painted,[[],[]]);
});
test('failed reads expose retry and recover without changing any roster data',async()=>{
 const f=fixture({fail:true});await f.run();assert.equal(f.button.hidden,false);assert.match(f.nodes.get('truppenMsg').textContent,/Kunde inte hämta/);f.recover();await f.button.click();assert.equal(f.button.hidden,true);assert.deepEqual(f.painted,[[{id:1}],[{id:2}]]);
});
test('permission denial clears old rows before offering retry',async()=>{
 const f=fixture({fail:true,denied:true});await f.run();assert.equal(f.cleared,1);assert.equal(f.nodes.get('playersList').cleared,true);assert.equal(f.nodes.get('coachesList').cleared,true);
});
