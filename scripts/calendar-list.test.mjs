import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const context={window:{},document:{addEventListener(){}}};
vm.runInNewContext(readFileSync(new URL('../calendar-list.js',import.meta.url),'utf8'),context);
test('calendar interleaves pools and training and puts completed activities after upcoming',()=>{
 const entries=[{kind:'pool',date:'20261108',time:'',finished:false},{kind:'training',date:'20261027',time:'18:00',finished:false},{kind:'training',date:'20261025',time:'',finished:true},{kind:'pool',date:'20261024',time:'',finished:true},{kind:'training',date:'20261107',time:'18:00',finished:false}];
 const result=context.window.NSKCalendarList.sortEntries(entries);
 assert.deepEqual(Array.from(result,item=>item.date),['20261027','20261107','20261108','20261025','20261024']);
 assert.equal(entries[0].date,'20261108');
});
