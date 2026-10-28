import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {mergeTraining,trainingSnapshot} from '../concurrency-merge.mjs';
const base=()=>({selected:['1'],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[],shirtColorCount:3,hall:''});
function fixture(remote){
 const nodes=new Map(),created=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:id==='trainingDate'?'2026-10-27':'',children:[],after(){},querySelectorAll:()=>[],replaceChildren(){this.children=[];},append(n){this.children.push(n);}});return nodes.get(id);};
 let session=structuredClone(remote),revision=1,saves=0;
 const ctx={window:{},document:{getElementById:id=>nodes.get(id)||created.find(n=>n.id===id)||(id==='trainingSaveRecovery'?null:node(id)),createElement:()=>{const n={children:[],append(x){this.children.push(x);},replaceChildren(){this.children=[];}};created.push(n);return n;}},structuredClone,Set,confirm:()=>true,console,renderRoster(){},renderCoaches(){},renderEquipment(){},renderGoalieSelectors(){},renderGroups(){},SharedTraining:{snapshotSession:async data=>trainingSnapshot(data),get:async()=>({session,revision}),mergeDraft:async(b,d,c)=>mergeTraining(b,d,c,true),save:async(_date,payload)=>{saves++;const next=mergeTraining(payload.base.session,trainingSnapshot(payload),session);session=next;return {session:next,revision:++revision};}}};
 const source=readFileSync(new URL('../training-groups.js',import.meta.url),'utf8'),prefix=source.slice(0,source.indexOf('  function renderRoster()'));
 vm.runInNewContext(prefix+`window.testing={persist,saveColors,queue:()=>saveQueue,current:captureTraining,set(data){selected=new Set(data.selected);selectedCoaches=new Set(data.selectedCoaches);allocation=data.allocation;goalies=data.goalies;goalieCount=data.goalieCount;shirtColorCount=data.shirtColorCount;trainingHall=data.hall;confirmedTraining=structuredClone(data);loadedDate='2026-10-27';},add(id){selected.add(id);},remove(id){selected.delete(id);goalies=goalies.filter(x=>selected.has(x));preserveColorGroups();},hall(value){trainingHall=value;},blocked:()=>saveBlocked};})();`,ctx);
 ctx.window.testing.set(base());return {run:ctx.window.testing,node,created,session:()=>session,saves:()=>saves};
}
test('queued attendance edits retain independent remote changes and update the latest visible draft',async()=>{
 const f=fixture({...base(),selected:['1','4'],hall:'Stora hallen'});f.run.add('2');f.run.persist();f.run.add('3');f.run.persist();await f.run.queue();
 assert.deepEqual(f.session().selected,['1','4','2','3']);assert.equal(f.session().hall,'Stora hallen');assert.equal(f.run.current().hall,'Stora hallen');assert.equal(f.saves(),2);assert.equal(f.run.blocked(),false);
});
test('true conflict preserves the draft and explicit keep-mine changes only edited fields',async()=>{
 const f=fixture({...base(),hall:'Stora hallen',selectedCoaches:['7']});f.run.hall('Lilla Hallen');f.run.persist();await f.run.queue();
 assert.equal(f.run.blocked(),true);assert.equal(f.run.current().hall,'Lilla Hallen');assert.equal(f.session().hall,'Stora hallen');
 const recovery=f.created.find(n=>n.id==='trainingSaveRecovery');assert(recovery);const keep=recovery.children.find(n=>n.textContent==='Behåll mina ändringar');await keep.onclick();
 assert.equal(f.run.blocked(),false);assert.equal(f.session().hall,'Lilla Hallen');assert.deepEqual(f.session().selectedCoaches,['7']);assert.equal(recovery.hidden,true);
});

test('explicit shirt save waits for queued edits and confirms only after server success',async()=>{
 const f=fixture({...base(),selected:['1','4']});f.run.add('2');f.run.persist();f.run.add('3');await f.run.saveColors();
 assert.deepEqual(f.session().selected,['1','4','2','3']);assert.equal(f.run.blocked(),false);assert.match(f.node('trainingColorStatus').textContent,/Tröjfärger sparade/);assert.equal(f.node('trainingSaveColors').disabled,false);
});
test('explicit shirt save reports a conflict without claiming success or losing the draft',async()=>{
 const f=fixture({...base(),hall:'Stora hallen'});f.run.hall('Lilla Hallen');await f.run.saveColors();assert.equal(f.run.blocked(),true);assert.doesNotMatch(f.node('trainingColorStatus').textContent,/Tröjfärger sparade/);assert.equal(f.run.current().hall,'Lilla Hallen');
});

test('rapid attendance removals keep colors and save each queued change without a false conflict',async()=>{
 const initial={...base(),selected:['1','2','3'],allocation:[['1'],['2'],['3']]};const f=fixture(initial);f.run.set(initial);f.run.remove('2');f.run.persist();f.run.remove('3');f.run.persist();await f.run.queue();
 assert.equal(f.run.blocked(),false);assert.equal(f.saves(),2);assert.deepEqual(f.session().selected,['1']);assert.deepEqual(f.session().allocation,[['1'],[],[]]);
});
