import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../training-cards.js',import.meta.url),'utf8');const context={window:{},document:{addEventListener(){}}};vm.runInNewContext(source,context);const cards=context.window.NSKTrainingCards;
test('calendar training actions link to the selected date and color editor',()=>{
 const html=cards.actions('2026-10-27','Stora hallen');assert.match(html,/Tröjfärger/);assert.match(html,/Träningsplanering/);assert.match(html,/Spara tröjfärger/);assert.match(html,/data-training-save-colors/);assert.match(html,/Redigera tröjfärger/);assert.match(html,/edit=colors#trainingGroups/);assert.match(html,/date=2026-10-27/);assert.match(html,/calendar_hall=Stora%20hallen/);assert.match(html,/data-training-presentation hidden/);
});
test('read-only presentation separates goalies and colored skaters and escapes names',()=>{
 const html=cards.presentation({selected:['1','2','3'],goalies:['1'],allocation:[['1','2'],['3']]},[{id:1,full_name:'Keeper Test'},{id:2,full_name:'Player <Test>'},{id:3,full_name:'Other Test'}]);
 assert.match(html,/Målvakter/);assert.equal(html.match(/Keeper Test/g).length,1);assert.match(html,/Player &lt;Test&gt;/);assert.match(html,/>Röd</);assert.match(html,/>Vit</);assert.doesNotMatch(html,/<(?:input|select|button)|draggable/);
});
test('missing allocations and missing sessions have explicit empty states',()=>{assert.match(cards.presentation(null,[]),/Ingen fördelning/);assert.match(cards.presentation({selected:[],goalies:[],allocation:[]},[]),/inte fördelade/);});
test('training finishes exactly one hour after its Stockholm end time',()=>{
 assert.equal(cards.finished('2026-10-27','18:00–19:15',new Date('2026-10-27T19:14:59Z')),false);
 assert.equal(cards.finished('2026-10-27','18:00–19:15',new Date('2026-10-27T19:15:00Z')),true);
 assert.equal(cards.finished('2026-07-01','18:00–19:15',new Date('2026-07-01T18:15:00Z')),true);
});
test('late trainings remain upcoming after midnight until the grace hour expires',()=>{
 assert.equal(cards.finished('2026-10-27','22:00–23:45',new Date('2026-10-27T23:30:00Z')),false);
 assert.equal(cards.finished('2026-10-27','22:00–23:45',new Date('2026-10-27T23:45:00Z')),true);
 assert.equal(cards.finished('2026-10-27','23:30–00:30',new Date('2026-10-28T00:30:00Z')),true);
});
test('saved training with empty hall and times receives calendar data independently of pools',()=>{
 const result=cards.enrich({date:'2026-10-25',hall:''},[{type:'training',date:'2026-10-25',hall:'Lilla Hallen',startTime:'13:45',endTime:'15:00'}]);
 assert.equal(result.hall,'Lilla Hallen');assert.equal(result.startTime,'13:45');assert.equal(result.endTime,'15:00');
 assert.equal(cards.finished(result.date,result.startTime+'–'+result.endTime,new Date('2026-10-25T15:00:00Z')),true);
});
test('calendar enrichment preserves saved data and refuses ambiguous or other-hall matches',()=>{
 const event={type:'training',date:'2026-10-25',hall:'Lilla Hallen',startTime:'13:45',endTime:'15:00'};
 const changed=cards.enrich({date:event.date,hall:'Stora hallen'},[event]);
 assert.equal(changed.hall,'Stora hallen');assert.equal(changed.startTime,'13:45');
 assert.equal(cards.enrich({date:event.date,hall:''},[event,{...event,startTime:'18:00'}]).hall,'');
 assert.equal(cards.enrich({date:event.date,hall:'Lilla Hallen',startTime:'14:00'},[event]).startTime,'14:00');
});
test('calendar shows new attendees without silently assigning or hiding their color',()=>{
 const html=cards.presentation({selected:['1','2','3'],goalies:[],allocation:[['1'],['2']]},[{id:1,full_name:'One'},{id:2,full_name:'Two'},{id:3,full_name:'New <Player>'}]);assert.match(html,/Utan tröjfärg/);assert.match(html,/New &lt;Player&gt;/);assert.equal(html.match(/New &lt;Player&gt;/g).length,1);
});

test('calendar save button saves the latest colors with its revision and existing attendance',async()=>{
 const handlers={},writes=[],session={revision:4,selected:['1','2'],selectedCoaches:['9'],goalies:[],goalieCount:0,hall:'Lilla Hallen',shirtColorCount:2,allocation:[['1'],['2']]},status={},button={disabled:false,closest:()=>({dataset:{date:'2026-11-02'},querySelector:()=>status})};
 const ctx={window:{addEventListener(){}},document:{hidden:true,addEventListener:(name,fn)=>{handlers[name]=fn;}},SharedTraining:{get:async()=>({session}),save:async(date,payload)=>{writes.push({date,payload});}}};vm.runInNewContext(source,ctx);
 await handlers.click({target:{closest:selector=>selector==='[data-training-save-colors]'?button:null}});
 assert.equal(writes.length,1);assert.equal(writes[0].payload.revision,4);assert.deepEqual(Array.from(writes[0].payload.selected),['1','2']);assert.equal(JSON.stringify(writes[0].payload.allocation),JSON.stringify(session.allocation));assert.match(status.textContent,/sparade/);assert.equal(button.disabled,false);
});
