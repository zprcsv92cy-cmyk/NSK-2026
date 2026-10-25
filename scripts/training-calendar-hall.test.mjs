import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../shared-training.js',import.meta.url),'utf8');
function client(items){const context={window:{},Auth:{activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic-token'},fetch:async url=>({ok:true,json:async()=>url.includes('/api/lag')?{results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]}:{items}})};vm.runInNewContext(source,context);return context.window.SharedTraining;}
test('hall follows the selected training date and normalizes calendar spelling',async()=>{
 const c=client([{type:'training',date:'2026-10-27',hall:'Stora Hallen'},{type:'training',date:'2026-10-29',hall:'Lilla ishallen'}]);
 assert.equal(await c.calendarHall('2026-10-27'),'Stora hallen');assert.equal(await c.calendarHall('2026-10-29'),'Lilla Hallen');assert.equal(await c.calendarHall('2026-10-28'),'');
});
test('pool locations and conflicting or unknown training halls cannot select a hall',async()=>{
 assert.equal(await client([{type:'pool',date:'2026-10-27',hall:'Stora Hallen'}]).calendarHall('2026-10-27'),'');
 assert.equal(await client([{type:'training',date:'2026-10-27',hall:'Stora Hallen'},{type:'training',date:'2026-10-27',hall:'Lilla Hallen'}]).calendarHall('2026-10-27'),'');
});
