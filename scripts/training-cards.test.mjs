import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../training-cards.js',import.meta.url),'utf8');const context={window:{},document:{addEventListener(){}}};vm.runInNewContext(source,context);const cards=context.window.NSKTrainingCards;
test('two training actions link to the selected date and preserve calendar hall',()=>{
 const html=cards.actions('2026-10-27','Stora hallen');assert.match(html,/Tröjfärger/);assert.match(html,/Träningsplanering/);assert.match(html,/date=2026-10-27/);assert.match(html,/calendar_hall=Stora%20hallen/);assert.match(html,/data-training-presentation hidden/);
});
test('read-only presentation separates goalies and colored skaters and escapes names',()=>{
 const html=cards.presentation({selected:['1','2','3'],goalies:['1'],allocation:[['1','2'],['3']]},[{id:1,full_name:'Keeper Test'},{id:2,full_name:'Player <Test>'},{id:3,full_name:'Other Test'}]);
 assert.match(html,/Målvakter/);assert.equal(html.match(/Keeper Test/g).length,1);assert.match(html,/Player &lt;Test&gt;/);assert.match(html,/>Röd</);assert.match(html,/>Vit</);assert.doesNotMatch(html,/<(?:input|select|button)|draggable/);assert.doesNotMatch(source,/\.save\(|method:\s*['"](?:PUT|POST|DELETE)/);
});
test('missing allocations and missing sessions have explicit empty states',()=>{assert.match(cards.presentation(null,[]),/Ingen fördelning/);assert.match(cards.presentation({selected:[],goalies:[],allocation:[]},[]),/inte fördelade/);});
