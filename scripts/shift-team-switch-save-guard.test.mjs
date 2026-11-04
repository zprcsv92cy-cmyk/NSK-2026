import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('  function renderShiftTeamButtons(teams) {');
const end=source.indexOf('  function setActiveShiftTeamButton(',start);
assert(start>=0&&end>start,'shift team button implementation must exist');
const segment=source.slice(start,end);
const match=segment.match(/btn\.addEventListener\("click", async \(\) => \{([\s\S]*?)\n      \}\);/);
assert(match,'shift team click handler must exist');
const Handler=Object.getPrototypeOf(async function(){}).constructor;
const handle=new Handler('i','shiftToggleSaving','setText','sessionStorage','syncFlowMatchChoices','setActiveShiftTeamButton','renderShiftSchema',match[1]);
async function selectTeam(pending){
 const session=new Map([['nsk2_pool_id','10'],['nsk2_lag_nr','1'],['nsk2_match_no','1'],['nsk2_team_match_10_2','3']]);
 const messages=[],calls=[];
 await handle(2,pending,(name,msg)=>messages.push([name,msg]),{
  getItem:key=>session.get(key)||null,
  setItem:(key,value)=>session.set(key,value)
 },(mode,value)=>{calls.push(['sync',mode,value]);return true;},value=>calls.push(['active',value]),async()=>calls.push(['render']));
 return {session,messages,calls};
}
test('team switch leaves active team unchanged until shift mark save completes',async()=>{
 const result=await selectTeam(true);
 assert.equal(result.session.get('nsk2_lag_nr'),'1');
 assert.deepEqual(result.calls,[]);
 assert.match(result.messages[0][1],/Vänta tills bytet har sparats innan du byter lag/);
});
test('team switch works normally after shift mark save completes',async()=>{
 const result=await selectTeam(false);
 assert.equal(result.session.get('nsk2_lag_nr'),'2');
 assert.deepEqual(result.calls,[['sync','shift','3'],['active','2'],['render']]);
 assert.deepEqual(result.messages,[]);
});
