import test from 'node:test';
import assert from 'node:assert/strict';
import {completeCalendarPool,planCalendarCompletion} from '../calendar-match-plan.mjs';
const incoming=['Eskilstuna','Järna','Södertälje','Åker'].map(opponent=>({opponent,startTime:''}));
const pool={id:5,active:true,teams:1,matches:3,title:'Poolspel',place:'Eskilstuna',hall:'Smehallen',pool_date:'2026-11-08',players_on_field:3,periods:1,period_time:15,sub_time:90};
const first={id:10,lag_no:1,match_no:1,opponent:'Eskilstuna',goalie_player_id:22,players_on_field:[1,2,3]};
test('Eskilstuna completion grows capacity and adds only missing metadata; retry is idempotent',async()=>{
 const current=structuredClone(pool),rows=[structuredClone(first)],original=JSON.stringify(rows[0]);let writes=0;
 const db={getPool:async()=>current,listPoolTeamMatchConfigs:async()=>rows,updatePool:async(id,data)=>Object.assign(current,data),saveCalendarMatchSchedule:async data=>{writes++;rows.push({...data,id:10+writes});}};
 assert.equal((await completeCalendarPool(db,5,incoming)).added,3);
 assert.equal(current.matches,4);assert.equal(rows.length,4);assert.equal(JSON.stringify(rows[0]),original);
 assert.equal((await completeCalendarPool(db,5,incoming)).added,0);assert.equal(writes,3);
});
test('completion refuses ambiguous existing matches or conflicting team count',()=>{
 assert.throws(()=>planCalendarCompletion(pool,[{...first,opponent:'Annan motståndare'}],incoming),/skiljer/);
 assert.throws(()=>planCalendarCompletion({...pool,teams:2},[first],incoming),/lag/);
 assert.throws(()=>planCalendarCompletion(pool,[first,first],incoming));
});
test('partial completion retries keep the original lineup and successful previous writes',async()=>{
 let rows=[structuredClone(first)],failed=false;
 const db={getPool:async()=>({...pool,matches:4}),listPoolTeamMatchConfigs:async()=>rows,saveCalendarMatchSchedule:async data=>{if(!failed&&data.match_no===3){failed=true;throw Error('Temporary failure');}rows.push(data);}};
 await assert.rejects(completeCalendarPool(db,5,incoming));
 await completeCalendarPool(db,5,incoming);
 assert.deepEqual(rows.map(r=>r.match_no),[1,2,3,4]);assert.deepEqual(rows[0].players_on_field,[1,2,3]);
});
