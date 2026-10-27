import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../shared-training.js',import.meta.url),'utf8');
function client(items){const context={window:{},document:{addEventListener(){}},Auth:{activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic-token'},fetch:async url=>({ok:true,json:async()=>url.includes('/api/lag')?{results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]}:{items}})};vm.runInNewContext(readFileSync(new URL('../training-cards.js',import.meta.url),'utf8'),context);vm.runInNewContext(source,context);return context.window.SharedTraining;}
test('hall follows the selected training date and normalizes calendar spelling',async()=>{
 const c=client([{type:'training',date:'2026-10-27',hall:'Stora Hallen'},{type:'training',date:'2026-10-29',hall:'Lilla ishallen'}]);
 assert.equal(await c.calendarHall('2026-10-27'),'Stora hallen');assert.equal(await c.calendarHall('2026-10-29'),'Lilla Hallen');assert.equal(await c.calendarHall('2026-10-28'),'');
});
test('pool locations and conflicting or unknown training halls cannot select a hall',async()=>{
 assert.equal(await client([{type:'pool',date:'2026-10-27',hall:'Stora Hallen'}]).calendarHall('2026-10-27'),'');
 assert.equal(await client([{type:'training',date:'2026-10-27',hall:'Stora Hallen'},{type:'training',date:'2026-10-27',hall:'Lilla Hallen'}]).calendarHall('2026-10-27'),'');
});
test('upcoming training choices are ordered, exclude past dates and pools, and preserve same-day information',()=>{
 const c=client([]);
 const choices=c.upcomingDates([
 {type:'training',date:'2026-10-29',startTime:'18:00',hall:'Stora Hallen'},
 {type:'pool',date:'2026-10-28'},
 {type:'training',date:'2026-10-25'},
 {type:'training',date:'2026-10-27',startTime:'13:45',hall:'Lilla Hallen'},
 {type:'training',date:'2026-10-27',startTime:'18:00',hall:'Stora Hallen'},
 {type:'training',date:'invalid'}
 ],new Date('2026-10-26T10:00:00Z'));
 assert.deepEqual(Array.from(choices,x=>x.date),['2026-10-27','2026-10-29']);
 assert.match(choices[0].label,/13:45 Lilla Hallen.*18:00 Stora Hallen/);
 assert.equal(c.upcomingDates([],new Date('2026-10-26T10:00:00Z')).length,0);
});
test('equipment roster comes from authenticated team staff and filters other roles',async()=>{
 const requests=[];
 const context={window:{},Auth:{activeTeam:()=> 'NSK Team 18',getToken:()=> 'synthetic-token'},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.includes('/api/lagpersonal')?{ok:true,results:[{id:'12345678-1234-1234-1234-123456789abc',name:'Anna Testsson',role:'Materialförvaltare'},{id:'other',name:'Other',role:'Lagledare'}]}:{results:[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]}};}};
 vm.runInNewContext(source,context);
 const people=await context.window.SharedTraining.listEquipment();
 assert.equal(people.length,1);assert.equal(people[0].full_name,'Anna Testsson');
 assert.match(requests[1].url,/\/api\/lagpersonal\?team_id=18$/);
 assert.equal(requests[1].options.headers.Authorization,'Bearer synthetic-token');
});


test('planning choices disappear at the same end-plus-one-hour boundary as calendar cards',()=>{
 const c=client([]),event={type:'training',date:'2026-10-27',startTime:'18:00',endTime:'19:15',hall:'Stora hallen'};
 assert.equal(c.upcomingDates([event],new Date('2026-10-27T19:14:59Z')).length,1);
 assert.equal(c.upcomingDates([event],new Date('2026-10-27T19:15:00Z')).length,0);
 const summer={...event,date:'2026-07-01'};
 assert.equal(c.upcomingDates([summer],new Date('2026-07-01T18:14:59Z')).length,1);
 assert.equal(c.upcomingDates([summer],new Date('2026-07-01T18:15:00Z')).length,0);
});
test('planning keeps late previous-day sessions through the grace hour and handles unknown end times like calendar',()=>{
 const c=client([]),late={type:'training',date:'2026-10-27',startTime:'23:30',endTime:'00:30'};
 assert.equal(c.upcomingDates([late],new Date('2026-10-28T00:29:59Z')).length,1);
 assert.equal(c.upcomingDates([late],new Date('2026-10-28T00:30:00Z')).length,0);
 const unknown={type:'training',date:'2026-10-27',startTime:'18:00'};
 assert.equal(c.upcomingDates([unknown],new Date('2026-10-27T22:59:59Z')).length,1);
 assert.equal(c.upcomingDates([unknown],new Date('2026-10-27T23:00:00Z')).length,0);
});
test('same-day choice hides completed sessions but retains other upcoming sessions and accepts alternate time fields',()=>{
 const c=client([]),events=[{type:'training',date:'2026-10-27',start_time:'09:00',end_time:'10:00',hall:'Lilla Hallen'},{type:'training',date:'2026-10-27',start_time:'18:00',end_time:'19:00',hall:'Stora hallen'}];
 const choices=c.upcomingDates(events,new Date('2026-10-27T12:00:00Z'));
 assert.equal(choices.length,1);assert.match(choices[0].label,/18:00 Stora hallen/);assert.doesNotMatch(choices[0].label,/09:00|Lilla/);
});


test('open picker removes an expired session without switching the editor date or rebuilding unchanged options',()=>{
 const events=[{type:'training',date:'2026-10-27',startTime:'18:00',endTime:'19:15'},{type:'training',date:'2026-10-28',startTime:'18:00',endTime:'19:15'}];
 let renders=0;
 const picker={children:[],value:'',replaceChildren(){this.children=[];renders++;},append(option){this.children.push(option);}};
 const date={value:'2026-10-27',hidden:true,readOnly:false};
 const context={window:{},events,document:{getElementById:id=>id==='trainingDate'?date:picker,createElement:()=>({})},SharedTraining:client([])};
 const groups=readFileSync(new URL('../training-groups.js',import.meta.url),'utf8');
 const prefix=groups.slice(0,groups.indexOf('  async function restore(){'));
 vm.runInNewContext(prefix+'calendarEvents=events;window.refresh=refreshTrainingChoices;})();',context);
 context.window.refresh(new Date('2026-10-27T19:14:59Z'));
 assert.deepEqual(picker.children.map(o=>o.value),['2026-10-27','2026-10-28']);assert.equal(picker.value,date.value);assert.equal(date.hidden,true);
 context.window.refresh(new Date('2026-10-27T19:15:00Z'));
 assert.deepEqual(picker.children.map(o=>o.value),['','2026-10-28']);assert.equal(date.value,'2026-10-27');assert.equal(date.hidden,false);assert.equal(date.readOnly,true);assert.equal(picker.value,'');
 context.window.refresh(new Date('2026-10-27T19:15:01Z'));assert.equal(renders,2);
 date.value='2026-10-28';context.window.refresh(new Date('2026-10-27T19:15:01Z'));assert.equal(picker.value,'2026-10-28');assert.equal(date.hidden,true);
});
