import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function nskPoolGathering('),source.indexOf('function nskVersionRoot('));
const context={};vm.runInNewContext(fn,context);
test('gathering is one hour before earliest match across both teams',()=>{
 assert.equal(context.nskPoolGathering(['12:30','11:00:00','11:45']),'Samling kl 10:00');
 assert.equal(context.nskPoolGathering(['09:15']),'Samling kl 08:15');
 assert.equal(context.nskPoolGathering(['00:30']),'Samling kl 23:30');
});
test('missing, placeholder and invalid match times do not invent a gathering',()=>{
 assert.equal(context.nskPoolGathering(['','00:00:00',null,'25:12','11:99']),'');
 assert.equal(context.nskPoolGathering(['00:00','invalid','11:00']),'Samling kl 10:00');
});

test('pool weekday matches Swedish calendar and rejects invalid dates',()=>{
 assert.equal(context.nskPoolWeekday('2026-11-08'),'Söndag');
 assert.equal(context.nskPoolWeekday('20261121'),'Lördag');
 assert.equal(context.nskPoolWeekday('2026-02-30'),'');
 assert.equal(context.nskPoolWeekday(''),'');
});
