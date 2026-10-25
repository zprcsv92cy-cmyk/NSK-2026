import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseChangingRooms,fetchChangingRooms,runChangingRoomCheck} from '../worker/rbok-changing-rooms.js';
const context={};vm.runInNewContext(readFileSync(new URL('../changing-rooms.js',import.meta.url),'utf8'),context);
const match=context.NSKChangingRooms.match;
const row=(team='NSK 18',room='10',day='Sön 25 Okt')=>`<tr><td>${day}</td><td>12:45 - 15:30</td><td>Rosvalla / Lilla ishallen / Omkl. ${room}</td><td>Nyk&#xF6;pings Sportklubb <div>${team}</div></td><td>Ishockey</td></tr>`;
const board=(...rows)=>'<table><tbody>'+rows.join('')+'</tbody></table>';
test('board entities, dates and explicit Team 18 are parsed; other teams and generic club ignored',()=>{
 const rows=parseChangingRooms(board(row(),row('J18 Allettan'),row(''),row('NSK 16, NSK 15'),row('NSK 18','11')),'2026-10-25');
 assert.equal(rows.length,2);assert.equal(rows[0].date,'2026-10-25');assert.equal(rows[0].room,'10');
 assert.equal(match(rows,'2026-10-25','Lilla Hallen','13:45–15:00'),' Omkl. 10 och 11');
});
test('missing time, wrong hall/date and bookings not covering training never match',()=>{
 const rows=parseChangingRooms(board(row()),'2026-10-25');
 for(const args of [['2026-10-25','Stora hallen','13:45–15:00'],['2026-10-26','Lilla hallen','13:45–15:00'],['2026-10-25','Lilla hallen',''],['2026-10-25','Lilla hallen','15:00–16:00']])assert.equal(match(rows,...args),'');
});
test('duplicate rows collapse, two rooms sort numerically, excess conflicts hidden',()=>{
 const rows=parseChangingRooms(board(row('NSK 18','11'),row(),row()),'2026-10-25');
 assert.equal(match(rows,'2026-10-25','Lilla hallen','13:45–15:00'),' Omkl. 10 och 11');
 rows.push({...rows[0],room:'12'});assert.equal(match(rows,'2026-10-25','Lilla hallen','13:45–15:00'),'');
});
test('year rollover resolves only near the check date; malformed/old dates fail closed',()=>{
 assert.equal(parseChangingRooms(board(row('NSK 18','10','Fre 1 Jan')),'2026-12-31')[0].date,'2027-01-01');
 assert.equal(parseChangingRooms(board(row('NSK 18','10','Sön 25 Okt')),'2026-12-31').length,0);
 assert.throws(()=>parseChangingRooms('<html>Error</html>','2026-10-25'));
});
test('bounded fetch rejects bad responses and oversized streamed bodies',async()=>{
 await assert.rejects(fetchChangingRooms(async()=>new Response('oops',{status:500}),null));
 await assert.rejects(fetchChangingRooms(async()=>new Response('x'.repeat(524289),{headers:{'content-type':'text/html'}}),null),/large/);
});
function envWith(items=[]){let saved=null;return {env:{NSK_ENABLE_SVENSKALAG_AUTO_SYNC:'true',NSK_SVENSKALAG_TEAM_ID:'NSK Team 18',NSK_TRAINERS:{get:async()=>saved,put:async(_,v)=>{saved=JSON.parse(v);}},AUTH_DB:{prepare:()=>({bind:()=>({all:async()=>({results:items.map(x=>({event_json:JSON.stringify(x)}))})})})}},get:()=>saved};}
const fetchBoard=async()=>new Response(board(row()),{headers:{'content-type':'text/html'}});
test('10:00 check follows Stockholm winter and summer time, duplicates skipped',async()=>{
 for(const instant of ['2026-10-25T09:00:00Z','2026-07-01T08:00:00Z']){
  const fixture=envWith();assert.equal((await runChangingRoomCheck(fixture.env,new Date(instant),fetchBoard)).checked,true);
  assert.equal((await runChangingRoomCheck(fixture.env,new Date(instant),fetchBoard)).skipped,'already checked');
 }
});
test('extra check approximately two hours before calendar training; no fetch when not due',async()=>{
 const fixture=envWith([{startTime:'17:45'}]);
 assert.equal((await runChangingRoomCheck(fixture.env,new Date('2026-10-26T14:45:00Z'),fetchBoard)).checked,true);
 const other=envWith([{startTime:'17:45'}]);assert.equal((await runChangingRoomCheck(other.env,new Date('2026-10-26T12:00:00Z'),()=>{throw Error('Must not fetch');})).skipped,'not due');
});
test('failed fetch preserves prior snapshot and isolated deployments cannot scrape',async()=>{
 assert.equal((await runChangingRoomCheck({NSK_ISOLATED_MODE:'true'})).skipped,'disabled');
 const fixture=envWith();await assert.rejects(runChangingRoomCheck(fixture.env,new Date('2026-10-25T09:00:00Z'),async()=>{throw Error('offline');}));assert.equal(fixture.get(),null);
});
