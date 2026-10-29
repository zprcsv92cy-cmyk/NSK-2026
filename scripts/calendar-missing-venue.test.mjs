import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const source=fs.readFileSync(new URL('../svenskalag-home.js',import.meta.url),'utf8');const code=source.slice(source.indexOf(' let poolMatchContext='),source.indexOf(' const esc='));
const same=Function('poolLocation',code+'return samePool;')(item=>({hall:item.place||item.hall||'',city:item.place||item.hall||''}));
const saved={id:1,pool_date:'2026-11-07',place:'EV inställd',hall:'EV inställd'},incoming={type:'pool',date:'2026-11-07',place:'',hall:'',notice:'SvenskaLag anger EV inställd.'};
test('reported cancellation placeholder and missing venue map to one existing pool',()=>{assert.equal(same(saved,incoming,[saved],[incoming]),true);});
test('never merge by date alone when more than one pool exists on either side',()=>{assert.equal(same(saved,incoming,[saved,{...saved,id:2}],[incoming]),false);assert.equal(same(saved,incoming,[saved],[incoming,{...incoming,place:'Other hall'}]),false);assert.equal(same({...saved,pool_date:'2026-11-08'},incoming,[saved],[incoming]),false);});
test('different known venues remain separate even with only one pool each',()=>{assert.equal(same({...saved,place:'Hall A',hall:'Hall A'},{...incoming,place:'Hall B'},[saved],[incoming]),false);});

test('a known different fixture list cannot fall back to the same date and venue',()=>{
 const helpers=Function('poolLocation',code+'return {same:samePool,set(value){poolMatchContext=value;}};')(item=>({hall:item.place||item.hall||'',city:'Eskilstuna'}));
 const pool={id:36,pool_date:'2026-11-08',place:'Eskilstuna',hall:'Smehallen'};
 const item={type:'pool',date:'2026-11-08',place:'Smehallen',matches:[{opponent:'Linden Vit',startTime:'12:00'}]};
 helpers.set({pools:[pool],items:[item],links:new Map(),summaries:new Map([['36',[{opponent:'Linden Gul'}]]])});
 assert.equal(helpers.same(pool,item),false);
 helpers.set({pools:[pool],items:[item],links:new Map([[item,'36']]),summaries:new Map([['36',[{opponent:'Linden Gul'}]]])});
 assert.equal(helpers.same(pool,item),true);
});
