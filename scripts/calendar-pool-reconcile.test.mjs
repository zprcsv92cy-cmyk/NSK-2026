import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileCalendarPools as reconcile} from '../calendar-pool-reconcile.mjs';
const date='2026-11-08';
const fixtures=[{opponent:'Linden Gul',startTime:'12:40'},{opponent:'SSK Blå',startTime:'13:20'},{opponent:'Åker Gul',startTime:'13:20'},{opponent:'Järna Röd',startTime:''}];
const pool=(source='SweHockey',matches=fixtures)=>({type:'pool',source,date,place:'Smehallen B',hall:'Smehallen B',matches});
const saved={id:36,pool_date:date,place:'Eskilstuna',hall:'Smehallen'};
const summaries=new Map([['36',fixtures.map(({opponent})=>({opponent,start_time:''}))]]);
test('saved pool matches the complete fixture list across known Smehallen names without changing stored data',()=>{
 const items=[pool()],before=JSON.stringify({items,saved});const result=reconcile(items,[saved],summaries);
 assert.equal(result.links.get(result.items[0]),'36');assert.equal(JSON.stringify({items,saved}),before);
});
test('a different pool at the same rink and date is not linked by date or venue alone',()=>{
 const result=reconcile([pool('SweHockey',[{opponent:'Linden Vit',startTime:'12:00'}])],[saved],summaries);
 assert.equal(result.links.size,0);
});
test('identical single match from two sources merges and preserves the tentative cancellation notice',()=>{
 const a={...pool('SvenskaLag',[{opponent:'Linden Vit',startTime:'12:00'}]),place:'EV inställd',hall:'EV inställd'};
 const result=reconcile([a,pool('SweHockey',[{opponent:'Linden Vit',startTime:'12:00'}])],[]);
 assert.equal(result.items.length,1);assert.equal(result.items[0].hall,'Smehallen B');assert.match(result.items[0].notice,/EV inställd/);
});
test('different known venues or dates stay separate; same venue combines distinct fixtures',()=>{
 for(const changed of [{hall:'Other rink'}, {date:'2026-11-09'},{matches:[{opponent:'Other',startTime:'12:00'}]},{matches:[{opponent:'Linden Vit',startTime:'13:00'}]},{matches:[{opponent:'Linden Vit',startTime:'12:00',ownTeam:'NSK Vit'}]}]){
  const a=pool('SvenskaLag',[{opponent:'Linden Vit',startTime:'12:00',ownTeam:'NSK Röd'}]);
  const result=reconcile([a,{...pool('SweHockey',a.matches),...changed}],[]);
  assert.equal(result.items.length,changed.hall||changed.date?2:1,JSON.stringify(changed));
 }
});
test('single match without a known time and repeated opponents share a venue card',()=>{
 for(const matches of [[{opponent:'A',startTime:''}],[{opponent:'A',startTime:'12:00'},{opponent:'A',startTime:'13:00'}]])assert.equal(reconcile([pool('SvenskaLag',matches),pool('SweHockey',matches)],[]).items.length,1);
});
test('multiple source cards share a venue but ambiguous saved links remain unlinked',()=>{
 assert.equal(reconcile([pool('SvenskaLag'),pool(),pool('Third source')],[]).items.length,1);
 assert.equal(reconcile([pool()],[saved,{...saved,id:37}],new Map([...summaries,['37',fixtures]])).links.size,0);
});
test('empty source pool is combined with known same-venue fixtures',()=>{
 const empty=pool('SvenskaLag',[]);const result=reconcile([empty,pool(),pool('SweHockey',[{opponent:'Linden Vit',startTime:'12:00'}])],[]);
 assert.equal(result.items.length,1);assert.ok(result.items[0].matches.length>=1);
});
test('only a uniquely represented standalone match is suppressed; unrelated matches remain',()=>{
 const match={type:'match',date,place:'Smehallen B',opponent:'Linden Gul',startTime:'12:40'};
 const other={...match,opponent:'Other'};const result=reconcile([pool(),match,other],[]);
 assert.equal(result.items.filter(x=>x.type==='match').length,1);assert.equal(result.items.find(x=>x.type==='match').opponent,'Other');
});
test('different source notices survive reconciliation',()=>{
 const a={...pool('SvenskaLag'),notice:'Kontrollera tid'};const b={...pool(),notice:'Hall ändrad'};
 assert.match(reconcile([a,b],[]).items[0].notice,/Kontrollera tid.*Hall ändrad/);
});

test('missing source times are enriched from the matching full schedule',()=>{
 const a=pool('SvenskaLag',fixtures.map(m=>({...m,startTime:''})));
 const result=reconcile([a,pool()],[]);assert.equal(result.items.length,1);assert.equal(result.items[0].matches[0].startTime,'12:40');
});
test('unresolved cancellation text is a visible notice and never a venue',()=>{
 const a={...pool('SvenskaLag',[]),place:'EV inställd',hall:'EV inställd'};
 const result=reconcile([a],[]);assert.equal(result.items.length,1);assert.equal(result.items[0].place,'');assert.equal(result.items[0].hall,'');assert.match(result.items[0].notice,/EV inställd/);
});

test('raw calendar cancellation placeholders retain their linked standalone fixture during merging',()=>{
 const placeholder={type:'pool',source:'SvenskaLag',date,place:'EV inställd',hall:''};
 const match={type:'match',date,place:'EV inställd',opponent:'Linden Vit',startTime:'12:00'};
 const rich=pool('SweHockey',[{opponent:'Linden Vit',startTime:'12:00'}]);
 const result=reconcile([placeholder,match,rich],[]);
 assert.equal(result.items.length,1);assert.match(result.items[0].notice,/EV inställd/);assert.equal(result.items[0].matches.length,1);
});

test('unknown venue cards with overlapping opponents and extra fixtures consolidate',()=>{
 const a={type:'pool',source:'SvenskaLag',date:'2026-11-07',place:'EV inställd',hall:'',matches:[{opponent:'Åker Röd',startTime:'12:30'},{opponent:'Järna Svart',startTime:'13:10'}]};
 const b={type:'pool',source:'SweHockey',date:'2026-11-07',place:'',hall:'',matches:[...a.matches,{opponent:'Linden Vit',startTime:'14:00'}]};
 const result=reconcile([a,b],[]);
 assert.equal(result.items.length,1);
 assert.equal(result.items[0].matches.length,3);
 assert.match(result.items[0].notice,/EV inställd/);
});
test('unknown venue events without overlapping opponents remain distinct',()=>{
 const a={type:'pool',source:'SvenskaLag',date,place:'',hall:'',matches:[{opponent:'A',startTime:'12:00'}]};
 const b={type:'pool',source:'SweHockey',date,place:'',hall:'',matches:[{opponent:'B',startTime:'12:00'}]};
 assert.equal(reconcile([a,b],[]).items.length,2);
});

test('timestamp dates link to saved calendar days and merged cards retain all removable source keys',()=>{
 const a={...pool('SvenskaLag'),key:'source-a',date:date+'T00:00:00Z'},b={...pool('SweHockey'),key:'source-b'},result=reconcile([a,b],[{...saved,pool_date:date+'T00:00:00Z'}],summaries);
 assert.equal(result.items.length,1);assert.equal(result.links.get(result.items[0]),String(saved.id));assert.deepEqual(result.items[0].sourceKeys.sort(),['source-a','source-b']);
});
