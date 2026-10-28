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
test('different known venues, times, opponents, own teams or dates stay separate',()=>{
 for(const changed of [{hall:'Other rink'}, {date:'2026-11-09'},{matches:[{opponent:'Other',startTime:'12:00'}]},{matches:[{opponent:'Linden Vit',startTime:'13:00'}]},{matches:[{opponent:'Linden Vit',startTime:'12:00',ownTeam:'NSK Vit'}]}]){
  const a=pool('SvenskaLag',[{opponent:'Linden Vit',startTime:'12:00',ownTeam:'NSK Röd'}]);
  assert.equal(reconcile([a,{...pool('SweHockey',a.matches),...changed}],[]).items.length,2,JSON.stringify(changed));
 }
});
test('single match without a known time and repeated opponents cannot establish identity',()=>{
 for(const matches of [[{opponent:'A',startTime:''}],[{opponent:'A',startTime:'12:00'},{opponent:'A',startTime:'13:00'}]])assert.equal(reconcile([pool('SvenskaLag',matches),pool('SweHockey',matches)],[]).items.length,2);
});
test('ambiguous source or saved candidates remain visible and unlinked',()=>{
 assert.equal(reconcile([pool('SvenskaLag'),pool(),pool('Third source')],[]).items.length,3);
 assert.equal(reconcile([pool()],[saved,{...saved,id:37}],new Map([...summaries,['37',fixtures]])).links.size,0);
});
test('empty source pool is preserved rather than guessed into one of several schedules',()=>{
 const empty=pool('SvenskaLag',[]);const result=reconcile([empty,pool(),pool('SweHockey',[{opponent:'Linden Vit',startTime:'12:00'}])],[]);
 assert.equal(result.items.length,3);
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
