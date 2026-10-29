import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mergeConcurrent} from '../concurrency-merge.mjs';
const source=readFileSync(new URL('../person-cards.js',import.meta.url),'utf8');
const recoverySource=source.slice(source.indexOf(' async function recoverConflict()'),source.indexOf(' async function perform(action)'));
const base=()=>({number:'18',position:'Forward',hand:'Left',hollow:'17 mm',model:'',profile:'',notes:'',goalieEnabled:false,goalie:{hollow:'17 mm',profile:'',model:'',notes:''}});
function fixture({read,editing=true}={}){
 let token='session-a',shown=null,message='',reads=0;const initial={team:'18',kind:'player',id:'101',revision:1,canEditProfile:true,canEditSkates:true,card:base()},draft={...base(),number:'22'};
 const api=Function('initial','isEditing','get','Auth','values','concurrency','fillForm','render','status','controls','recovery',`let current=initial,pending=false,conflicted=true,editing=isEditing,version=1;${recoverySource};return {recover:recoverConflict,state:()=>({current,pending,conflicted})};`)(initial,editing,async()=>{reads++;return read?read():{...initial,revision:9,card:{...base(),number:'19',position:'Back',hollow:'20 mm'}};},{getToken:()=>token},()=>structuredClone(draft),async()=>({mergeConcurrent}),card=>shown=structuredClone(card),()=>{},text=>message=text,()=>{},{});
 return {api,initial,draft,shown:()=>shown,message:()=>message,reads:()=>reads,token:value=>token=value};
}
test('conflict recovery preserves edited fields and independent remote changes for review without saving',async()=>{
 const f=fixture();await f.api.recover();const state=f.api.state();assert.equal(f.reads(),1);assert.equal(state.pending,false);assert.equal(state.conflicted,false);
 assert.equal(state.current.revision,9);assert.equal(state.current.card.number,'19');assert.equal(f.shown().number,'22');assert.equal(f.shown().hollow,'20 mm');assert.equal(f.shown().position,'Back');assert.match(f.message(),/Granska och tryck Spara kort/);
});
test('failed reload retains the original base and draft and permits recovery retry',async()=>{
 let fail=true;const f=fixture({read:()=>{if(fail)throw Error('Offline');return {...f.initial,revision:2};}});await f.api.recover();assert.equal(f.api.state().current,f.initial);assert.equal(f.api.state().conflicted,true);assert.equal(f.api.state().pending,false);assert.equal(f.draft.number,'22');assert.equal(f.shown(),null);
 fail=false;await f.api.recover();assert.equal(f.api.state().conflicted,false);assert.equal(f.shown().number,'22');
});
test('session replacement and revoked edit permission cannot rebase the draft',async()=>{
 for(const reason of ['session','permission']){const f=fixture({read:()=>{if(reason==='session')f.token('session-b');return {...f.initial,revision:2,canEditSkates:reason!=='permission'};}});await f.api.recover();assert.equal(f.api.state().current,f.initial);assert.equal(f.api.state().conflicted,true);assert.equal(f.shown(),null);assert.match(f.message(),/Inga ändringar har sparats/);}
});
test('a conflict outside editing reloads the latest card without applying a draft',async()=>{
 const f=fixture({editing:false});await f.api.recover();assert.equal(f.shown().number,'19');assert.equal(f.api.state().current.revision,9);assert.equal(f.api.state().conflicted,false);
});
