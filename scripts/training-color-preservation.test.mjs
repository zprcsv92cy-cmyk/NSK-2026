import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingBase as base,trainingClientFixture as fixture} from './helpers/training-client-fixture.mjs';
test('removing attendance saves remaining color assignments instead of clearing all groups',async()=>{
 const f=fixture();f.toggle('2',false);await f.api.queue();assert.deepEqual(f.saved().selected,['1','3']);assert.deepEqual(f.saved().allocation,[['1'],[],['3']]);assert.equal(f.writes(),1);
});
test('new attendance automatically receives a color and remains manually editable',async()=>{
 const f=fixture();f.toggle('4',true);await f.api.queue();assert.deepEqual(f.saved().allocation,[['1','4'],['2'],['3']]);assert(!f.get('trainingGroups').children.some(g=>g.dataset.colorIndex==='-1'));const group=f.get('trainingGroups').children.find(g=>g.dataset.colorIndex==='0');const choose=group.children[1].children[1].children[1];choose.value='1';choose.fire('change');await f.api.queue();assert.deepEqual(f.saved().allocation,[['1'],['2','4'],['3']]);
});
test('attendance already assigns colors so distribution is unnecessary and does not reshuffle',async()=>{
 const f=fixture();f.toggle('4',true);await f.api.queue();f.api.distribute();await f.api.queue();assert.deepEqual(f.saved().allocation,[['1','4'],['2'],['3']]);const writes=f.writes();f.api.distribute();await f.api.queue();assert.equal(f.writes(),writes);
});
test('changing goalie preserves other groups and automatically colors the previous goalie',async()=>{
 const f=fixture({...base(),goalies:['1'],goalieCount:1,allocation:[[],['2'],['3']]});f.api.renderGoalieSelectors();const choose=f.get('trainingGoalies').children[0].children[0];choose.value='2';choose.fire('change');await f.api.queue();assert.deepEqual(f.saved().goalies,['2']);assert.deepEqual(f.saved().allocation,[['1'],[],['3']]);assert(!f.get('trainingGroups').children.some(g=>g.dataset.colorIndex==='-1'));
});
test('replacing imported attendance keeps colors for remaining players',async()=>{
 const f=fixture();f.api.initImport();f.api.import(['1','3','4']);f.get('trainingImportApply').fire('click');await f.api.queue();assert.deepEqual(f.saved().selected,['1','3','4']);assert.deepEqual(f.saved().allocation,[['1'],['4'],['3']]);
});

test('removing an attending goalie saves presence and keeps the remaining skater colors',async()=>{
 const f=fixture({...base(),goalies:['2'],goalieCount:1,allocation:[['1'],[],['3']]});f.toggle('2',false);await f.api.queue();assert.equal(f.saved().goalieCount,0);assert.deepEqual(f.saved().goalies,[]);assert.deepEqual(f.saved().allocation,[['1'],[],['3']]);
});

test('automatic attendance colors respect two and four configured groups',async()=>{
 for(const [count,allocation,expected] of [[2,[['1'],['2']],[['1','3'],['2','4']]],[4,[['1'],['2'],['3'],[]],[['1'],['2'],['3'],['4']]]]){
  const f=fixture({...base(),shirtColorCount:count,allocation});f.toggle('4',true);await f.api.queue();assert.deepEqual(f.saved().allocation,expected);
 }
});
