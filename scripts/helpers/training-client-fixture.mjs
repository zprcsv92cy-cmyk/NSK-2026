import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {validateTrainingPayload} from '../../worker/training-session-validation.js';
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
export const trainingBase=()=>({selected:['1','2','3'],selectedCoaches:[],goalies:[],goalieCount:0,allocation:[['1'],['2'],['3']],shirtColorCount:3,hall:''});
export function trainingClientFixture(initial=trainingBase(),saveImpl){
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};let saved=structuredClone(initial),writes=0;
 const context={window:{},document:{getElementById:get,createElement:tag=>new Node(tag),createTextNode:text=>({text}),addEventListener(){}},structuredClone,console,SharedTraining:{save:async(_date,payload)=>{const {base,...clean}=payload;assert(validateTrainingPayload(clean));writes++;saved=structuredClone(clean);delete saved.revision;return saveImpl?saveImpl(_date,payload):{revision:writes+1,session:saved};}}};
 const source=readFileSync(new URL('../../training-groups.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,`window.testing={renderRoster,renderGroups,renderGoalieSelectors,distribute,initImport,queue:()=>saveQueue,current:captureTraining,set(data){players=['1','2','3','4','5'].map(id=>({id,full_name:'Player '+id}));selected=new Set(data.selected);goalies=data.goalies;goalieCount=data.goalieCount;allocation=data.allocation;shirtColorCount=data.shirtColorCount;trainingHall=data.hall;confirmedTraining=structuredClone(data);revision=Number(data.revision)||0;loadedDate='2026-10-28';},import(ids){importMatches=ids.map(id=>({id,kind:'player',full_name:'Player '+id,exact:true}));}};})();`);
 vm.runInNewContext(source,context);get('trainingDate').value='2026-10-28';context.window.testing.set(structuredClone(initial));
 return {api:context.window.testing,get,saved:()=>saved,writes:()=>writes,toggle(id,checked){context.window.testing.renderRoster();const check=get('trainingRoster').children[Number(id)-1].children[0];check.checked=checked;check.fire('change');}};
}
