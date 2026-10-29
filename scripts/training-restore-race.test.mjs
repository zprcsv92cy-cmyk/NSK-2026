import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {trainingSnapshot} from '../concurrency-merge.mjs';
const source=readFileSync(new URL('../training-groups.js',import.meta.url),'utf8');
const A='2026-11-01',B='2026-11-02';
const session=(date,revision)=>({selected:[date===A?'1':'2'],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[[date===A?'1':'2']],shirtColorCount:date===A?3:4,hall:date===A?'Lilla Hallen':'Stora hallen',revision});
function fixture({blockSnapshot=false,blockGet=false,rejectOldGet=false}={}){
 const nodes=new Map(),reads=new Map();let release,announce,fail=false;const started=new Promise(r=>announce=r),gate=new Promise(r=>release=r);
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',textContent:''});return nodes.get(id);};
 const context={window:{},document:{getElementById:node},location:{search:''},URLSearchParams,structuredClone,SharedTraining:{get:async date=>{const count=(reads.get(date)||0)+1;reads.set(date,count);const result=session(date,date===A?(count===1?3:9):7);if(blockGet&&date===A&&count===1){announce();await gate;if(rejectOldGet)throw Error('Old load failed');}return {session:result};},calendarHall:async()=>'',snapshotSession:async data=>{if(fail)throw Error('Snapshot unavailable');if(blockSnapshot&&data.revision===3){announce();await gate;}return trainingSnapshot(data);}}};
 vm.runInNewContext(source.slice(0,source.indexOf('  function setTrainingSaveMessage'))+`players=[{id:1},{id:2}];window.testing={restore,state:()=>({selected:[...selected],hall:trainingHall,shirtColorCount,confirmed:confirmedTraining,revision,loadedDate})};})();`,context);
 return {api:context.window.testing,node,date:value=>node('trainingDate').value=value,started,release,fail:()=>fail=true};
}
test('a delayed snapshot from the previous training cannot replace the current save base',async()=>{
 const f=fixture({blockSnapshot:true});f.date(A);const old=f.api.restore();await f.started;f.date(B);assert.equal(await f.api.restore(),true);f.release();assert.equal(await old,false);
 const state=f.api.state();assert.equal(state.loadedDate,B);assert.equal(state.revision,7);assert.equal(state.confirmed.hall,'Stora hallen');assert.deepEqual([...state.confirmed.selected],['2']);assert.deepEqual([...state.selected],['2']);
});
test('a failed snapshot leaves the previous confirmed training and visible settings intact',async()=>{
 const f=fixture();f.date(A);await f.api.restore();f.date(B);f.fail();await assert.rejects(f.api.restore(),/Snapshot unavailable/);
 const state=f.api.state();assert.equal(state.loadedDate,A);assert.equal(state.revision,3);assert.equal(state.hall,'Lilla Hallen');assert.equal(state.shirtColorCount,3);assert.deepEqual([...state.selected],['1']);assert.equal(f.node('trainingHall').value,'Lilla Hallen');
});
test('switching A to B and back to A ignores the oldest response for A',async()=>{
 const f=fixture({blockGet:true});f.date(A);const old=f.api.restore();await f.started;f.date(B);await f.api.restore();f.date(A);await f.api.restore();assert.equal(f.api.state().revision,9);f.release();assert.equal(await old,false);assert.equal(f.api.state().revision,9);assert.equal(f.api.state().loadedDate,A);
});

test('an error from an obsolete load does not interrupt the newly selected training',async()=>{
 const f=fixture({blockGet:true,rejectOldGet:true});f.date(A);const old=f.api.restore();await f.started;f.date(B);await f.api.restore();f.release();assert.equal(await old,false);assert.equal(f.api.state().loadedDate,B);assert.equal(f.api.state().revision,7);
});
