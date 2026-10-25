import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../svenskalag-home.js',import.meta.url),'utf8');
// Exercise the exact classic-script helper without browser network or storage access.
const helper=source.slice(source.indexOf(' const calendarDate='),source.indexOf(' let latestCalendarPools='));
const matchesForPool=Function(helper+'return matchesForPool;')();
const matches=[
 {date:'2026-12-13',startTime:'10:00',opponent:'Lag A',place:'Åkers Ishall'},
 {date:'2026-12-13',startTime:'00:00',opponent:'Lag B',place:'Lilla Hallen'},
 {date:'2026-12-12',startTime:'09:00',opponent:'Lag C',place:'Lilla Hallen'},
 {date:'2026-12-13',startTime:'11:00',opponent:'Lag D',place:''}
];
test('same-day pools only receive their own venue matches',()=>{
 assert.deepEqual(matchesForPool({date:'2026-12-13',place:' lilla  hallen '},matches).map(m=>m.opponent),['Lag B']);
 assert.deepEqual(matchesForPool({date:'2026-12-13',place:'Åkers Ishall'},matches).map(m=>m.opponent),['Lag A']);
 assert.deepEqual(matchesForPool({date:'2026-12-13'},matches),[]);
});
test('explicit activity links take priority over date or venue guesses',()=>{
 const pool={date:'2026-12-13',activityId:'pool-a',place:'Lilla Hallen'};
 const linked=[{...matches[0],poolActivityId:'pool-a'},{...matches[1],poolActivityId:'pool-b'}];
 assert.deepEqual(matchesForPool(pool,linked).map(m=>m.opponent),['Lag A']);
});
test('linked matches stay deduplicated and unknown midnight is not presented as a real time',()=>{
 const pool={date:'2026-12-13',place:'Lilla Hallen',matches:[matches[1]]};
 const result=matchesForPool(pool,matches);
 assert.equal(result.length,1);assert.equal(result[0].startTime,'');
});
