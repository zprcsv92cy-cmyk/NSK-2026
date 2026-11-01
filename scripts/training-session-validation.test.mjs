import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrainingPayload} from '../worker/training-session-validation.js';
const good={selected:['1'],selectedCoaches:[],goalies:['1'],goalieCount:1,allocation:[],revision:0};
test('valid shared training payload',()=>assert.equal(validateTrainingPayload(good),true));
test('never accept OCR or images',()=>{
 for(const field of ['ocr','image','screenshot','filename','rawText'])assert.equal(validateTrainingPayload({...good,[field]:'secret'}),false);
});
test('reject malformed attendance and invalid revision',()=>{
 assert.equal(validateTrainingPayload({...good,selected:['1','1']}),false);
 assert.equal(validateTrainingPayload({...good,goalies:['2']}),false);
 assert.equal(validateTrainingPayload({...good,revision:-1}),false);
});

test('group allocation uses arrays and rejects repeated or unknown players',()=>{
 const grouped={...good,selected:['1','2','3'],goalies:['1'],allocation:[['2'],['3'],[]]};
 assert.equal(validateTrainingPayload(grouped),true);
 assert.equal(validateTrainingPayload({...grouped,allocation:[['2'],['2'],[]]}),false);
 assert.equal(validateTrainingPayload({...grouped,allocation:[['4'],[],[]]}),false);
 assert.equal(validateTrainingPayload({...grouped,allocation:[['1'],['2'],[]]}),false);
});

test('goalie count allows unnamed places but never more names than places',()=>{
 assert.equal(validateTrainingPayload({...good,goalieCount:2}),true);
 assert.equal(validateTrainingPayload({...good,goalieCount:0,goalies:[]}),true);
 assert.equal(validateTrainingPayload({...good,goalieCount:2,goalies:[]}),true);
 assert.equal(validateTrainingPayload({...good,goalieCount:0}),false);
 assert.equal(validateTrainingPayload({...good,goalieCount:2,goalies:['']}),false);
});

test('equipment attendance accepts only namespaced UUIDs in staff attendance, never as players or goalies',()=>{
 const id='equipment:12345678-1234-1234-1234-123456789abc';
 assert.equal(validateTrainingPayload({...good,selectedCoaches:['2',id]}),true);
 assert.equal(validateTrainingPayload({...good,selectedCoaches:[id,id]}),false);
 assert.equal(validateTrainingPayload({...good,selectedCoaches:['equipment:arbitrary']}),false);
 assert.equal(validateTrainingPayload({...good,selected:[id],goalies:[id]}),false);
});
