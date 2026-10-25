import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {planCalendarMatches} from '../calendar-match-plan.mjs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=app.indexOf('  async function savePool() {');
const end=app.indexOf('  function renderLaguppstallningTeamButtons(',start);
assert.ok(start>=0&&end>start);
const source=app.slice(start,end).replace(
  "const {planCalendarMatches}=await import(new URL('calendar-match-plan.mjs',nskVersionRoot()).href);",'');

for(const count of [1,4,5,6,16]){
  test('calendar save flow persists '+count+' matches and resumes partial import in the same pool',async()=>{
    const matches=Array.from({length:count},(_,i)=>({startTime:String(9+Math.floor(i/2)).padStart(2,'0')+':'+(i%2?'30':'00'),opponent:'Opponent '+i,plan:'Plan 1'}));
    const plan=planCalendarMatches(matches);
    const values=new Map([['nsk2_calendar_match_pending',JSON.stringify(matches)]]);
    const sessionStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
    const fields=Object.fromEntries(Object.entries({poolPlace:'Testort',poolHall:'Testhall',poolDate:'2026-11-15',teams:plan.teams,matches:plan.matchesPerTeam,players:3,periods:1,periodTime:15,subTime:90}).map(([id,value])=>[id,{value:String(value)}]));
    fields.savePool={disabled:false};
    const messages=[];
    const window={APP_CONFIG:{REQUIRE_PERSONAL_MATCH_WRITES:true},location:{href:''}};
    let creates=0,attempts=0,fail=true,pool;
    const rows=[];
    const DB={
      addPool:async payload=>{creates++;assert.match(payload.calendar_import_key,/^[0-9a-f-]{36}$/);pool={id:91,...payload};return pool;},
      getPool:async id=>{assert.equal(Number(id),91);return pool;},
      listPoolTeamMatchConfigs:async()=>rows,
      saveCalendarMatchSchedule:async match=>{
        attempts++;
        if(fail){fail=false;throw Error('Synthetic interrupted write');}
        assert.ok(!rows.some(row=>row.lag_no===match.lag_no&&row.match_no===match.match_no));
        assert.equal(Object.hasOwn(match,'goalie_player_id'),false);
        assert.equal(Object.hasOwn(match,'players_on_field'),false);
        rows.push({id:100+rows.length,...match});
      }
    };
    const save=new Function('byId','safeInt','sessionStorage','DB','window','setText','crypto','planCalendarMatches',
      'return ('+source.trim()+');')(id=>fields[id]??null,(v,d)=>Number.parseInt(v,10)||d,sessionStorage,DB,window,(id,message)=>messages.push([id,message]),webcrypto,planCalendarMatches);
    await save();
    assert.equal(creates,1,JSON.stringify(messages));
    assert.equal(rows.length,count-1);
    assert.equal(window.location.href,'','partial import must not report success or redirect');
    assert.ok(values.has('nsk2_calendar_match_import_errors'));
    assert.ok(values.has('nsk2_calendar_match_pending'));
    assert.equal(fields.savePool.disabled,false);
    await save();
    assert.equal(creates,1,'resume must reuse the pool');
    assert.equal(attempts,count+1,'completed match steps must not be sent again');
    assert.equal(rows.length,count);
    assert.equal(window.location.href,'../startsida/');
    assert.equal(values.has('nsk2_calendar_match_import_errors'),false);
    assert.equal(values.has('nsk2_calendar_match_pending'),false);
    assert.equal(values.has('nsk2_calendar_pool_import_key'),false);
    assert.deepEqual(rows.map(({lag_no,match_no,start_time,opponent,plan})=>({lag_no,match_no,start_time,opponent,plan})).sort((a,b)=>a.start_time.localeCompare(b.start_time)),plan.schedule);
  });
}
