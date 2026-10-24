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

test('Standalone Strängnäs Ishall is recognized as pool venue',()=>{
  const words=[word('21',15,100),word('Poolspel',180,112),
    word('Strängnäs',200,148),word('Ishall',310,148),word('22',15,280)];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items[0]?.place,'Strängnäs Ishall');
});
test('Explicit venue label resolves place without opponent guessing',()=>{
  const words=[word('22',15,100),word('Poolspel',180,112),
    word('Plats:',180,147),word('Månsbrorinken',270,147),word('23',15,280)];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items[0]?.place,'månsbrorinken');
});

test('Training hall is not borrowed from a following poolspel',()=>{
  const words=[
    word('21',15,100),word('Träning',180,114),
    word('Poolspel',180,198),word('Stora',200,225),word('hallen',275,225),
    word('22',15,320)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.find(item=>item.type==='training')?.hall,null);
});
test('Pool venue is not borrowed from a following unrelated activity',()=>{
  const words=[
    word('21',15,100),word('Poolspel',180,114),
    word('Fotografering',180,198),
    word('Strängnäs',200,225),word('Ishall',305,225),
    word('22',15,320)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.find(item=>item.type==='pool')?.place,'');
});
test('Actual pool venue is read before later interest registration',()=>{
  const words=[
    word('21',15,100),word('Poolspel',180,114),
    word('Strängnäs',200,140),word('Ishall',310,140),
    word('Intresseanmälan',180,198),word('poolspel',320,198),
    word('22',15,320)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.find(item=>item.type==='pool')?.place,'Strängnäs Ishall');
});

test('Focused day retry reuses event scoped parser instead of reading unrelated halls',()=>{
  assert.match(source,/const focused=dayWords\.length\?parseCalendarLayout\(/);
  assert.doesNotMatch(source,/const hall=detectCalendarHall\(dayWords\)/);
  assert.doesNotMatch(source,/const venue=explicitPlace\?\.\[1\]\?\.trim\(\)\|\|detectPoolVenue\(dayWords\)/);
});

test('Grouped OCR token Is 17/18 is recognized as training',()=>{
  const words=[
    word('9',15,100),word('Is 17/18',180,114),
    word('Lilla',200,146),word('Hallen',275,146),
    word('10',15,250)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].type,'training');
  assert.equal(items[0].hall,'Lilla Hallen');
});
test('Grouped OCR token Is 18/19 is recognized as training',()=>{
  const words=[
    word('11',15,100),word('Is 18/19',180,114),
    word('Stora',200,146),word('hallen',275,146),
    word('12',15,250)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].hall,'Stora hallen');
});
test('Other activities remain excluded with grouped training labels',()=>{
  const words=[word('11',15,100),word('Hockeyfritids',180,114),word('Stora',200,146),word('hallen',275,146),word('12',15,250)];
  assert.equal(sandbox.parseCalendarLayout(words,'2026-11',1000).length,0);
});

test('Poolspel with appended calendar date is still recognized',()=>{
  const words=[
    word('21',15,100),word('Poolspel 21/11',180,114),
    word('Strängnäs',200,145),word('Ishall',310,145),
    word('22',15,280)
  ];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,1);
  assert.equal(items[0].type,'pool');
  assert.equal(items[0].place,'Strängnäs Ishall');
});
test('Interest registration with poolspel date remains excluded',()=>{
  const words=[
    word('21',15,100),word('Intresseanmälan',180,114),
    word('poolspel 21/11',340,114),
    word('22',15,280)
  ];
  assert.equal(sandbox.parseCalendarLayout(words,'2026-11',1000).length,0);
});

test('Focused OCR day anchors use the digit regex, not a literal backslash',()=>{
  const line=source.split('\n').find(line=>line.includes('const dayAnchors=globalWords.filter'));
  assert.ok(line,'focused day anchor filter exists');
  assert.ok(line.includes(String.raw`/^\d{1,2}$/`),'date anchor recognizes one or two digits');
  assert.equal(line.includes(String.raw`/^\\d{1,2}$/`),false,'regex must not match a literal backslash');
});

test('Unknown pool venue remains visible for review alongside a known venue',()=>{
  const items=JSON.parse(JSON.stringify(sandbox.reconcileCalendarPoolDuplicates([
    {type:'pool',date:'2026-11-21',place:''},
    {type:'pool',date:'2026-11-21',place:'Strängnäs Ishall'}
  ])));
  assert.equal(items.length,2);
  assert.equal(items[0].possibleDuplicate,true);
  assert.equal(items[0].place,'');
  assert.equal(items[1].place,'Strängnäs Ishall');
});
test('Distinct known pool venues on one date are never consolidated',()=>{
  const items=JSON.parse(JSON.stringify(sandbox.reconcileCalendarPoolDuplicates([
    {type:'pool',date:'2026-11-21',place:'Strängnäs Ishall'},
    {type:'pool',date:'2026-11-21',place:'Månsbrorinken'}
  ])));
  assert.equal(items.length,2);
});

test('Correcting an imported date retains multi-session and past-date safeguards',()=>{
  const review=source.slice(source.indexOf("dateInput.addEventListener('change'"),source.indexOf("// Hall names are never inferred"));
  assert.match(review,/next<todayLocalDate\(\)/);
  assert.match(review,/item\.multipleSessions/);
});
test('Corrected pool date checks venue as well as date for existing pools',()=>{
  const review=source.slice(source.indexOf("dateInput.addEventListener('change'"),source.indexOf("// Hall names are never inferred"));
  assert.match(review,/p\.pool_date===next&&!!normalizeCalendarPoolPlace\(item\.place\)&&normalizeCalendarPoolPlace\(p\.place\)===normalizeCalendarPoolPlace\(item\.place\)/);
});

test('Import selection uses each candidate checkbox, not potentially colliding string keys',()=>{
  const save=source.slice(source.indexOf("confirm.addEventListener('click'"));
  assert.match(save,/reviewChecks\.get\(c\)/);
  assert.match(save,/const selected=candidates\.filter/);
  assert.match(save,/for\(const item of selected\)/);
  assert.doesNotMatch(save,/const checked=new Set\(\[\.\.\.review\.querySelectorAll/);
});
test('Manual missing training gets its own checkbox identity',()=>{
  const add=source.slice(source.indexOf("addMissing.addEventListener('click'"),source.indexOf("confirm.addEventListener('click'"));
  assert.match(add,/reviewChecks\.set\(item,check\)/);
});

test('Changing training hall cannot re-enable import for a past date',()=>{
  const review=source.slice(source.indexOf("hallSelect.addEventListener('change'"),source.indexOf("label.append(check,text,dateInput,hallSelect)"));
  assert.match(review,/check\.disabled=already\|\|item\.date<todayLocalDate\(\)/);
  assert.match(review,/if\(check\.disabled\)check\.checked=false/);
});
test('Changing poolspel place cannot re-enable import for a past date',()=>{
  const review=source.slice(source.indexOf("placeInput.addEventListener('input'"),source.indexOf("label.append(check,text,dateInput,placeInput)"));
  assert.match(review,/check\.disabled=already\|\|item\.date<todayLocalDate\(\)/);
});

test('Final import date validation rejects invalid, out-of-month and expired dates',()=>{
  assert.equal(sandbox.validCalendarImportDate('2026-11-21','2026-11'),true);
  assert.equal(sandbox.validCalendarImportDate('2026-11-31','2026-11'),false);
  assert.equal(sandbox.validCalendarImportDate('2026-12-01','2026-11'),false);
  assert.equal(sandbox.validCalendarImportDate('2026-10-23','2026-10'),false);
  assert.equal(sandbox.validCalendarImportDate('2026-11-2','2026-11'),false);
});
test('Save confirmation checks selected activity dates before writing',()=>{
  const save=source.slice(source.indexOf("confirm.addEventListener('click'"));
  assert.match(save,/selected\.some\(c=>!validCalendarImportDate\(c\.date,importMonth\)\)/);
});

test('Pool calendar import creates a pool without asking match count',()=>{
  const review=source.slice(source.indexOf("const placeInput=document.createElement('input')"));
  const save=source.slice(source.indexOf("confirm.addEventListener('click'"));
  assert.doesNotMatch(review,/matchesInput/);
  assert.doesNotMatch(save,/item\.matches/);
  assert.match(save,/matches:4,players_on_field:3/);
});
test('Pool with known venue is eligible without match-count review',()=>{
  const review=source.slice(source.indexOf("for(const item of candidates){"));
  assert.match(review,/check\.disabled=exists\|\|\(item\.type==='pool'&&!item\.place\)/);
});

test('Dated poolspel title must agree with calendar date anchor',()=>{
  const words=[word('21',15,100),word('Poolspel 22/11',180,114),
    word('Strängnäs',200,145),word('Ishall',310,145),word('22',15,280)];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,0);
});
test('Dated poolspel title must agree with month',()=>{
  const words=[word('21',15,100),word('Poolspel 21/12',180,114),
    word('Strängnäs',200,145),word('Ishall',310,145),word('22',15,280)];
  const items=JSON.parse(JSON.stringify(sandbox.parseCalendarLayout(words,'2026-11',1000)));
  assert.equal(items.length,0);
});

test('Pool import review discloses rule defaults are not read from OCR',()=>{
  const review=source.slice(source.indexOf("const defaultsNote=document.createElement('small')"));
  assert.match(review,/Standardinställningar \(inte avlästa ur bilden\)/);
  assert.match(review,/2 lag, 3 spelare på plan, 1 period à 15 min, byten var 90:e sekund/);
  assert.match(review,/label\.append\(check,text,dateInput,placeInput,defaultsNote\)/);
});

test('Unknown venue does not cause any same-day saved pool to count as the same event',()=>{
  const review=source.slice(source.indexOf("const exists=item.type==='training'"));
  assert.match(review,/p\.pool_date===item\.date&&!!String\(item\.place\|\|''\)\.trim\(\)/);
  const fresh=source.slice(source.indexOf("const fresh=candidates.filter"));
  assert.match(fresh,/p\.pool_date===c\.date&&!!String\(c\.place\|\|''\)\.trim\(\)/);
});
test('Venue equality for existing calendar pools ignores surrounding whitespace',()=>{
  const review=source.slice(source.indexOf("const exists=item.type==='training'"));
  assert.match(review,/normalizeCalendarPoolPlace\(p\.place\)===normalizeCalendarPoolPlace\(item\.place\)/);
});

test('Calendar pool venue normalization handles case and repeated spaces',()=>{
  assert.equal(sandbox.normalizeCalendarPoolPlace('  STRÄNGNÄS   ISHALL  '),'strängnäs ishall');
  assert.equal(sandbox.normalizeCalendarPoolPlace('Strängnäs Ishall'),sandbox.normalizeCalendarPoolPlace('  strängnäs    ishall '));
});
test('Every existing pool comparison uses consistent venue normalization',()=>{
  const review=source.slice(source.indexOf("function setupCalendarImport(){"));
  assert.match(review,/normalizeCalendarPoolPlace\(p\.place\)===normalizeCalendarPoolPlace\(item\.place\)/);
  assert.match(review,/normalizeCalendarPoolPlace\(p\.place\)===normalizeCalendarPoolPlace\(c\.place\)/);
  assert.doesNotMatch(review,/String\(p\.place\|\|''\)\.toLocaleLowerCase\('sv-SE'\)===String\(item\.place\|\|''\)\.toLocaleLowerCase/);
});

test('Separate same-day pool venues have distinct import identities',()=>{
  const one={type:'pool',date:'2026-11-21',place:'Strängnäs Ishall'};
  const two={type:'pool',date:'2026-11-21',place:'Månsbrorinken'};
  assert.notEqual(sandbox.calendarImportIdentity(one),sandbox.calendarImportIdentity(two));
});
test('Same-day pool duplicates still collide after venue normalization',()=>{
  const one={type:'pool',date:'2026-11-21',place:'Strängnäs Ishall'};
  const two={type:'pool',date:'2026-11-21',place:'  STRÄNGNÄS   ISHALL '};
  assert.equal(sandbox.calendarImportIdentity(one),sandbox.calendarImportIdentity(two));
  assert.equal(sandbox.calendarImportIdentity({type:'training',date:'2026-11-21',hall:'Lilla Hallen'}),sandbox.calendarImportIdentity({type:'training',date:'2026-11-21',hall:'Stora hallen'}));
});
test('Save confirmation checks complete pool identity rather than only the date',()=>{
  const save=source.slice(source.indexOf("confirm.addEventListener('click'"));
  assert.match(save,/new Set\(selected\.map\(calendarImportIdentity\)\)/);
});

test('Failed pool save re-enables calendar import for retry',()=>{
  const save=source.slice(source.indexOf("confirm.addEventListener('click'"));
  assert.match(save,/Poolspel '\+item\.date\+' kunde inte sparas: '\+error\.message;confirm\.disabled=false;return;/);
});
test('Failed training save re-enables calendar import for retry',()=>{
  const save=source.slice(source.indexOf("confirm.addEventListener('click'"));
  assert.match(save,/Avbröt vid '\+item\.date\+': '\+error\.message;confirm\.disabled=false;return;/);
});

test('Empty calendar import selection stops before any write',()=>{
  const confirmation=source.slice(source.indexOf("confirm.addEventListener('click'"));
  const selectedAt=confirmation.indexOf('const selected=candidates.filter');
  const guardAt=confirmation.indexOf("if(!selected.length)");
  const writeAt=confirmation.indexOf('await DB.addPool');
  assert.ok(selectedAt>=0&&guardAt>selectedAt&&writeAt>guardAt);
  assert.match(confirmation.slice(guardAt,writeAt),/confirm\.disabled=false;return;/);
});

test('Calendar import review accurately says existing activities are never deleted',()=>{
  const review=source.slice(source.indexOf('const fresh=candidates.filter'));
  assert.match(review,/Importen lägger endast till aktiviteter; inga befintliga träningar eller poolspel tas bort/);
  assert.doesNotMatch(review,/Borttagning kräver separat bekräftelse/);
});

test('Editing imported calendar details preserves intentional manual deselection',()=>{
  const review=source.slice(source.indexOf("dateInput.addEventListener('change'"),source.indexOf("review.append(label);",source.indexOf("dateInput.addEventListener('change'")));
  assert.equal((review.match(/if\(check\.disabled\)check\.checked=false;/g)||[]).length,3);
  assert.doesNotMatch(review,/check\.checked=!check\.disabled;/);
});
test('Blocked calendar items still start unchecked and require explicit selection',()=>{
  const review=source.slice(source.indexOf("for(const item of candidates){"),source.indexOf("review.append(label);",source.indexOf("for(const item of candidates){")));
  assert.match(review,/check\.disabled=exists\|\|\(item\.type==='pool'&&!item\.place\);check\.checked=!check\.disabled/);
  assert.match(review,/if\(!item\.hall\|\|item\.multipleSessions\)\{check\.checked=false;check\.disabled=true/);
});

test('Changing date with unknown pool venue cannot falsely match an existing blank venue',()=>{
  const review=source.slice(source.indexOf("dateInput.addEventListener('change'"),source.indexOf("// Hall names are never inferred"));
  assert.match(review,/p\.pool_date===next&&!!normalizeCalendarPoolPlace\(item\.place\)/);
  assert.match(review,/\(item\.type==='pool'&&!item\.place\)/);
});
