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

test('Invalid day in selected month is never imported',()=>{
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout([
    ...row(30,100,[['Stora',210,35],['hallen',278,35]]),
    ...row(31,220,[['Lilla',210,35],['Hallen',278,35]])
  ],'2026-11',1000)));
  assert.deepEqual(items.map(x=>x.date),['2026-11-30']);
});
test('Venue token far from the hall label is not joined',()=>{
  assert.equal(sandbox.detectCalendarHall([
    word('Stora',200,100),word('hallen',900,100)
  ]),null);
});

test('Two different training halls on one date require review',()=>{
  const words=[
    word('9',15,100),word('Träning',180,112),
    word('Stora',210,135),word('hallen',278,135),
    word('Träning',180,165),
    word('Lilla',210,185),word('Hallen',278,185),
    word('10',15,260)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].date,'2026-11-09');
  assert.equal(items[0].hall,null);
  assert.equal(items[0].hallConflict,true);
});

test('Hockeyfritids is ignored when real ice training shares its date',()=>{
  const words=[
    word('9',15,100),word('Hockeyfritids',180,112),
    word('Stora',210,135),word('hallen',278,135),
    word('Is',180,170),word('Lilla',210,195),word('Hallen',278,195),
    word('10',15,270)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].multipleSessions,false);
  assert.equal(items[0].hall,'Lilla Hallen');
});

test('Only Hockeyfritids is not imported as training',()=>{
  const words=[word('9',15,100),word('Hockeyfritids',180,115),word('Stora',210,140),word('hallen',280,140),word('10',15,250)];
  assert.equal(sandbox.parseCalendarLayout(words,'2026-11',1000).length,0);
});
test('Only poolspel interest registration is not imported',()=>{
  const words=[word('8',15,100),word('Intresseanmälan',180,115),word('poolspel',315,115),word('9',15,250)];
  assert.equal(sandbox.parseCalendarLayout(words,'2026-11',1000).length,0);
});
test('Only photography is never imported',()=>{
  const words=[word('11',15,100),word('Fotografering',180,115),word('Rosvalla',250,135),word('12',15,250)];
  assert.equal(sandbox.parseCalendarLayout(words,'2026-11',1000).length,0);
});
test('Actual poolspel is imported as poolspel',()=>{
  const words=[word('21',15,100),word('Poolspel',180,115),word('Strängnäs',200,145),word('Ishall',300,145),word('22',15,250)];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].type,'pool');
});

test('Real poolspel survives an interest registration on the same date',()=>{
  const words=[
    word('8',15,100),
    word('Poolspel',180,115),word('Smehallen',190,140),
    word('Intresseanmälan',180,205),word('poolspel',320,205),
    word('9',15,310)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].type,'pool');
  assert.equal(items[0].date,'2026-11-08');
});
test('Training and poolspel on the same date remain two distinct types',()=>{
  const words=[
    word('21',15,100),
    word('Träning',180,115),word('Lilla',200,135),word('Hallen',270,135),
    word('Poolspel',180,205),word('Strängnäs',200,230),word('Ishall',310,230),
    word('22',15,320)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.deepEqual(items.map(x=>x.type),['pool','training']);
});
