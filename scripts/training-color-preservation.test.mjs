import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateTrainingPayload} from '../worker/training-session-validation.js';
class Node{
 constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.style={};this.events=new Map();this.value='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(key,value){this[key]=value;}
 addEventListener(name,fn){this.events.set(name,fn);}
 querySelectorAll(){return [];}
 after(){}
 fire(name){return this.events.get(name)?.({preventDefault(){}});}
}
const base=()=>({selected:['1','2','3'],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[['1'],['2'],['3']],shirtColorCount:3,hall:''});
function fixture(initial=base()){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};let saved=structuredClone(initial),writes=0;
 const context={window:{},document:{getElementById:get,createElement:tag=>new Node(tag),createTextNode:text=>({text}),addEventListener(){}},structuredClone,console,SharedTraining:{save:async(_date,payload)=>{const {base,...clean}=payload;assert(validateTrainingPayload(clean));writes++;saved=structuredClone(clean);delete saved.revision;return {revision:writes+1,session:saved};}}};
 const source=readFileSync(new URL('../training-groups.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,`window.testing={renderRoster,renderGroups,renderGoalieSelectors,distribute,initImport,queue:()=>saveQueue,current:captureTraining,set(data){players=['1','2','3','4','5'].map(id=>({id,full_name:'Player '+id}));selected=new Set(data.selected);goalies=data.goalies;goalieCount=data.goalieCount;allocation=data.allocation;shirtColorCount=data.shirtColorCount;trainingHall=data.hall;confirmedTraining=structuredClone(data);loadedDate='2026-10-28';},import(ids){importMatches=ids.map(id=>({id,kind:'player',full_name:'Player '+id,exact:true}));}};})();`);
 vm.runInNewContext(source,context);get('trainingDate').value='2026-10-28';context.window.testing.set(structuredClone(initial));
 return {api:context.window.testing,get,saved:()=>saved,writes:()=>writes,toggle(id,checked){context.window.testing.renderRoster();const check=get('trainingRoster').children[Number(id)-1].children[0];check.checked=checked;check.fire('change');}};
}
test('removing attendance saves remaining color assignments instead of clearing all groups',async()=>{
 const f=fixture();f.toggle('2',false);await f.api.queue();assert.deepEqual(f.saved().selected,['1','3']);assert.deepEqual(f.saved().allocation,[['1'],[],['3']]);assert.equal(f.writes(),1);
});
test('new attendance stays unassigned and can be moved to a color without moving existing players',async()=>{
 const f=fixture();f.toggle('4',true);await f.api.queue();assert.deepEqual(f.saved().allocation,[['1'],['2'],['3']]);const group=f.get('trainingGroups').children.find(g=>g.dataset.colorIndex==='-1');assert(group);assert.equal(group.children[0].textContent,'Utan tröjfärg');const choose=group.children[1].children[0].children[1];choose.value='1';choose.fire('change');await f.api.queue();assert.deepEqual(f.saved().allocation,[['1'],['2','4'],['3']]);
});
test('distribute assigns only unassigned attendees and does not reshuffle saved colors',async()=>{
 const f=fixture();f.toggle('4',true);await f.api.queue();f.api.distribute();await f.api.queue();assert.deepEqual(f.saved().allocation,[['1','4'],['2'],['3']]);const writes=f.writes();f.api.distribute();await f.api.queue();assert.equal(f.writes(),writes);
});
test('changing goalie preserves other groups and the previous goalie becomes unassigned',async()=>{
 const f=fixture({...base(),goalies:['1'],goalieCount:1,allocation:[[],['2'],['3']]});f.api.renderGoalieSelectors();const choose=f.get('trainingGoalies').children[0].children[0];choose.value='2';choose.fire('change');await f.api.queue();assert.deepEqual(f.saved().goalies,['2']);assert.deepEqual(f.saved().allocation,[[],[],['3']]);assert(f.get('trainingGroups').children.some(g=>g.dataset.colorIndex==='-1'));
});
test('replacing imported attendance keeps colors for remaining players',async()=>{
 const f=fixture();f.api.initImport();f.api.import(['1','3','4']);f.get('trainingImportApply').fire('click');await f.api.queue();assert.deepEqual(f.saved().selected,['1','3','4']);assert.deepEqual(f.saved().allocation,[['1'],[],['3']]);
});
