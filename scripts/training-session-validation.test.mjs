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
