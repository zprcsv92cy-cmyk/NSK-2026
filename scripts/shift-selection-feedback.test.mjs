import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('match selection exposes one pressed button and a visible selected label',()=>{
 const buttons=['3','4'].map(value=>({dataset:{shiftMatchCard:value},classList:{toggle(name,on){this.selected=on;}},setAttribute(name,value){this[name]=value;},subtitle:{},querySelector(){return this.subtitle;}}));
 const begin=source.indexOf('  function setActiveShiftMatchButton('),end=source.indexOf('  let shiftToggleSaving',begin);
 const select=Function('document',source.slice(begin,end)+'return setActiveShiftMatchButton;')({querySelectorAll:()=>buttons});
 select('3');assert.equal(buttons[0]['aria-pressed'],'true');assert.match(buttons[0].subtitle.textContent,/Vald match/);
 select('4');assert.equal(buttons[0]['aria-pressed'],'false');assert.equal(buttons[0].subtitle.textContent,'Visa bytesschema');assert.equal(buttons[1]['aria-pressed'],'true');
});
test('shift content completes before slow coach lookup and ignores its stale response',async()=>{
 let resolveCoach;const coach=new Promise(resolve=>resolveCoach=resolve),texts={};
 const begin=source.indexOf('  async function renderShiftSchemaData()'),end=source.indexOf('    if(!wrap)return;',begin);
 const vars={shiftViewGeneration:0,shiftBackgroundRefresh:false,shiftUndo:null,shiftStructure:null};
 const pool={period_time:15,sub_time:60,periods:1,players_on_field:3},configs=[{lag_no:1,match_no:3,goalie_player_id:7,players_on_field:[1,2,3],player_count:3}];
 const context={...vars,sessionStorage:{getItem:key=>key==='nsk2_pool_id'?'10':'1',setItem(){}},byId:id=>id==='shiftMatch'?{value:'3'}:null,setText:(id,value)=>texts[id]=value,setActiveShiftMatchButton(){},setActiveShiftTeamButton(){},getCoachNamesForLag:()=>coach,getPlayersCached:async()=>[],getCoachesCached:()=>{throw Error("Tränarregistret ska inte blockera schemat");},shortName:x=>x,shiftStructureOf:JSON.stringify,DB:{getPool:async()=>pool,listPoolTeamMatchConfigs:async()=>configs,listShiftSchema:async()=>[{players_json:[1,2,3],shift_no:1,period_no:1,time_left:'15:00'}]}};
 const {default:vm}=await import('node:vm');vm.runInNewContext(source.slice(begin,end)+'} this.render=renderShiftSchemaData;',context);
 await context.render();assert.equal(texts.bytesschemaTitle,'Match 3 • Lag 1');assert.equal(texts.shiftCoachNames,'—');
 context.shiftViewGeneration++;resolveCoach('Old match coach');await new Promise(resolve=>setImmediate(resolve));assert.equal(texts.shiftCoachNames,'—');
});
