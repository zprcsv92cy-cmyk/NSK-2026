import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
test('match switching starts independent metadata, coach, material and shift reads together',async()=>{
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='lineupMatch'?'2':id==='lineupPlayerCount'?'1':'',dataset:{},options:[],dispatchEvent(){}});return nodes.get(id);};
 let release;const gate=new Promise(r=>release=r),started=[];
 const load=async(name,result)=>{started.push(name);await gate;return result;};
 const ctx={window:{},clearTimeout(){},byId:node,sessionStorage:{getItem:k=>k==='nsk2_pool_id'?'10':k==='nsk2_lag_nr'?'1':null},DB:{getPoolTeamMatchConfig:(_p,_l,m)=>load('config'+m,{id:100+Number(m),goalie_player_id:1,player_count:1}),getCoachSelection:()=>load('coaches',{saved:true,coach_ids:[]}),getPoolMaterial:()=>load('material',{name:'—'}),listShiftSchema:()=>load('shifts',[]),getLineup:async()=>[{person_type:'player',person_id:2,sort_order:1}]},setText(){},updateLineupEditControls(){},renderCoachOptions:async()=>{},renderLineupSelectors:async()=>{},safeInt:Number,cleanUUID:v=>String(v||''),updateVisiblePlayers(){},setActiveMatchButton(){},syncGoalieAgainstPlayers(){},syncSelectedPlayersAcrossLineup(){},loadCoachSelectionFromKV:async()=>{},updateCoachEnabledState(){},renderPoolMaterial(){}};
 vm.runInNewContext(section('  async function fillLaguppstallningFormFromSelection()', '  async function validateUniquePlayersPerMatch(')+';globalThis.run=fillLineupData;',ctx);
 const pending=ctx.run();assert.deepEqual(started.sort(),['coaches','config1','config2','material','shifts']);release();await pending;
 assert.equal(ctx.window.__nskLineupLoading,false);
});
test('resaving an unchanged shift schedule does not issue a write or fetch its known rows again',async()=>{
 let writes=0;
 const expected=[{shift_no:1,period_no:1,time_left:'01:00',players_json:[2]}];
 const ctx={safeInt:(v,d)=>Number(v)||d,DB:{getPool:async()=>({players_on_field:1,periods:1,period_time:1,sub_time:60}),getPoolTeamMatchConfig:async()=>({id:101}),getLineup:async()=>[{person_type:'player',person_id:2,sort_order:1}],listShiftSchema:async()=>{throw Error('Redundant shift read');},saveShiftSchema:async()=>writes++}};
 vm.runInNewContext(section('  function buildShiftSchedule(', '  // Capture the selected match')+';globalThis.run=regenerateShiftSchemaFor;',ctx);
 await ctx.run('10','1','1',expected);assert.equal(writes,0);
 await ctx.run('10','1','1',[{...expected[0],time_left:'00:30'}]);assert.equal(writes,1);
});
