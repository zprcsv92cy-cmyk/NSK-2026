import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
import {mergeTraining,trainingSnapshot} from '../concurrency-merge.mjs';
const base=()=>({selected:['1'],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[],shirtColorCount:3,hall:''});
function fixture(remote,saveFailure,overrides={}){
 const nodes=new Map(),created=[];const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:id==='trainingDate'?'2026-10-27':'',children:[],after(){},querySelectorAll:()=>[],replaceChildren(){this.children=[];},append(n){this.children.push(n);}});return nodes.get(id);};
 let session=structuredClone(remote),revision=1,saves=0;
 const ctx={window:{},document:{getElementById:id=>nodes.get(id)||created.find(n=>n.id===id)||(id==='trainingSaveRecovery'?null:node(id)),createElement:()=>{const n={children:[],append(x){this.children.push(x);},replaceChildren(){this.children=[];}};created.push(n);return n;}},structuredClone,Set,confirm:()=>true,console,renderRoster(){},renderCoaches(){},renderEquipment(){},renderGoalieSelectors(){},renderGroups(){},SharedTraining:{snapshotSession:async data=>trainingSnapshot(data),get:async()=>({session:{...session,revision}}),mergeDraft:async(b,d,c)=>mergeTraining(b,d,c,true),save:async(_date,payload)=>{saves++;if(saveFailure)throw saveFailure;if(!Number.isSafeInteger(payload.revision)||payload.revision<0)throw Error('Invalid revision');const next=mergeTraining(payload.base.session,trainingSnapshot(payload),session);session=next;return {session:next,revision:++revision};}}};
 Object.assign(ctx.SharedTraining,overrides);
 const source=readFileSync(new URL('../training-groups.js',import.meta.url),'utf8'),prefix=source.slice(0,source.indexOf('  function renderRoster()'));
 vm.runInNewContext(prefix+`window.testing={persist,saveColors,queue:()=>saveQueue,current:captureTraining,set(data){selected=new Set(data.selected);selectedCoaches=new Set(data.selectedCoaches);allocation=data.allocation;goalies=data.goalies;goalieCount=data.goalieCount;shirtColorCount=data.shirtColorCount;trainingHall=data.hall;confirmedTraining=structuredClone(data);loadedDate='2026-10-27';},add(id){selected.add(id);},remove(id){selected.delete(id);goalies=goalies.filter(x=>selected.has(x));preserveColorGroups();},hall(value){trainingHall=value;},revision:()=>revision,blocked:()=>saveBlocked};})();`,ctx);
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

test('a timed out save retains attendance and colors, releases the button and requires explicit recovery',async()=>{
 const f=fixture(base(),new Error('Anropet tog för lång tid.'));f.run.add('2');await f.run.saveColors();
 assert.equal(f.run.blocked(),true);assert.deepEqual([...f.run.current().selected],['1','2']);assert.equal(f.run.current().shirtColorCount,3);
 assert.equal(f.node('trainingSaveColors').disabled,false);assert.match(f.node('trainingColorStatus').textContent,/Dina val finns kvar/);assert.doesNotMatch(f.node('trainingColorStatus').textContent,/Tröjfärger sparade/);assert.equal(f.saves(),1);assert(f.created.find(n=>n.id==='trainingSaveRecovery'));
});

test('saving is blocked until the selected training date is loaded',()=>{
 const f=fixture(base());f.node('trainingDate').value='2026-11-02';f.run.add('2');assert.equal(f.run.persist(),undefined);assert.equal(f.saves(),0);assert.match(f.node('trainingStatus').textContent,/Vänta tills träningen/);assert.deepEqual([...f.run.current().selected],['1','2']);
});

test('reading the latest training recovers its nested revision before the next save',async()=>{
 const f=fixture({...base(),hall:'Stora hallen'});f.run.hall('Lilla Hallen');f.run.persist();await f.run.queue();assert.equal(f.run.blocked(),true);
 const recovery=f.created.find(n=>n.id==='trainingSaveRecovery');await recovery.children.find(n=>n.textContent==='Läs senaste träningen').onclick();
 assert.equal(f.run.blocked(),false);assert.equal(f.run.revision(),1);assert.equal(f.run.current().hall,'Stora hallen');
 f.run.add('2');f.run.persist();await f.run.queue();assert.equal(f.run.blocked(),false);assert.deepEqual(f.session().selected,['1','2']);
});

test('an unreadable recovery revision preserves the draft and does not send a write',async()=>{
 for(const label of ['Läs senaste träningen','Behåll mina ändringar']){
  const f=fixture({...base(),hall:'Stora hallen'},undefined,{get:async()=>({session:{...base(),hall:'Stora hallen'}})});f.run.hall('Lilla Hallen');f.run.persist();await f.run.queue();
  const before=f.saves(),recovery=f.created.find(n=>n.id==='trainingSaveRecovery');await recovery.children.find(n=>n.textContent===label).onclick();
  assert.equal(f.saves(),before);assert.equal(f.run.blocked(),true);assert.equal(f.run.current().hall,'Lilla Hallen');assert.match(f.node('trainingStatus').textContent,/sparversion kunde inte läsas/);
 }
});
test('both recovery choices round-trip real authenticated training responses and SQLite revisions',async t=>{
 const {fixture:authFixture}=await import('./helpers/auth-d1-fixture.mjs'),{createTrainingHandler}=await import('../worker/training-sessions-api.js'),{withConcurrentResources}=await import('../worker/concurrent-resources.js');
 const auth=await authFixture(t);for(const name of ['20261022_training_sessions.sql','20261023_training_hall_colors.sql'])for(const sql of readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8').split(';').filter(s=>s.trim()))await auth.db.prepare(sql).run();
 await auth.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(auth.root,'lineup:edit').run();
 const env={...auth.env,NSK_MULTIUSER_ENABLED:'true'},handler=withConcurrentResources(createTrainingHandler(env,async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]));
 const call=async(method,payload)=>{const r=await handler(new Request('https://test/api/training?team_id=18&date=2026-10-27',{method,headers:{Authorization:'Bearer '+auth.tokens.root,'Content-Type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})}),env),data=await r.json();if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});return data;};
 await call('PUT',{...base(),hall:'Stora hallen',selectedCoaches:['7'],revision:0,base:{session:trainingSnapshot()}});
 const f=fixture(base(),undefined,{get:()=>call('GET'),save:(_date,payload)=>call('PUT',payload)});f.run.hall('Lilla Hallen');f.run.persist();await f.run.queue();assert.equal(f.run.blocked(),true);
 let recovery=f.created.find(n=>n.id==='trainingSaveRecovery');await recovery.children.find(n=>n.textContent==='Behåll mina ändringar').onclick();assert.equal(f.run.blocked(),false);
 let latest=await call('GET');assert.equal(latest.revision,undefined);assert.equal(latest.session.revision,2);assert.equal(latest.session.hall,'Lilla Hallen');assert.deepEqual(latest.session.selectedCoaches,['7']);
 await call('PUT',{...trainingSnapshot(latest.session),hall:'Stora hallen',revision:2,base:{session:trainingSnapshot(latest.session)}});
 f.run.hall('');f.run.persist();await f.run.queue();assert.equal(f.run.blocked(),true);recovery=f.created.find(n=>n.id==='trainingSaveRecovery');await recovery.children.find(n=>n.textContent==='Läs senaste träningen').onclick();assert.equal(f.run.revision(),3);
 f.run.add('2');f.run.persist();await f.run.queue();assert.equal(f.run.blocked(),false);latest=await call('GET');assert.equal(latest.session.revision,4);assert.equal(latest.session.hall,'Stora hallen');assert.deepEqual(latest.session.selected,['1','2']);assert.deepEqual(latest.session.selectedCoaches,['7']);
});
