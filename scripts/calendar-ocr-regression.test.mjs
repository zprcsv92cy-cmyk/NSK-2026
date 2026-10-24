// Regression tests for the actual browser calendar parser; no screenshots stored.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../home-training.js',import.meta.url),'utf8');
const start=source.indexOf('function detectCalendarHall(words){');
const end=source.indexOf('function setupCalendarImport(){',start);
assert.ok(start>=0&&end>start,'calendar parser functions must exist');
const sandbox={todayLocalDate:()=> '2026-10-24'};
vm.createContext(sandbox);
vm.runInContext(source.slice(start,end),sandbox);

function word(text,x,y){return {text,bbox:{x0:x,y0:y,x1:x+60,y1:y+16}};}
function row(day,y,venue){
  const result=[word(String(day),15,y),word('Träning',180,y+12)];
  if(venue)result.push(...venue.map(([text,x,dy])=>word(text,x,y+dy)));
  return result;
}
test('October training venues belong to the correct dates',()=>{
  const words=[
    ...row(25,100,[['Lilla',210,35],['Hallen',275,35]]),
    ...row(27,220,[['Stora',210,35],['hallen',278,38]]),
    ...row(28,340,[['Stora',210,35],['hallen',278,35]]),
    ...row(31,460,[['Lilla',210,35],['Hallen',275,35]])
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-10',1000)));
  assert.deepEqual(items.map(({date,hall})=>[date,hall]),[
    ['2026-10-25','Lilla Hallen'],
    ['2026-10-27','Stora hallen'],
    ['2026-10-28','Stora hallen'],
    ['2026-10-31','Lilla Hallen']
  ]);
});
test('Repeated date marker from overlapping crops does not split its venue',()=>{
  const words=[...row(27,220,[['Stora',210,35],['hallen',278,38]]),word('27',16,225),...row(28,340,[['Stora',210,35],['hallen',278,35]])];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-10',1000)));
  assert.equal(items.length,2);
  assert.equal(items[0].hall,'Stora hallen');
});
test('Never borrow the next day venue when OCR omits a hall',()=>{
  const words=[...row(27,220,null),...row(28,340,[['Stora',210,35],['hallen',278,35]])];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-10',1000)));
  assert.equal(items[0].hall,null);
  assert.equal(items[1].hall,'Stora hallen');
});
