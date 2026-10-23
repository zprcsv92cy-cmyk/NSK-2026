import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTrainingPayload,trainingSessionKey} from '../worker/training-session-validation.js';

const valid=()=>({
 selected:['101','102','103'],selectedCoaches:['201'],goalies:['101'],
 goalieCount:1,allocation:[['102'],['103']],revision:0
});

test('accepts a valid new training and an updated revision',()=>{
 assert.equal(validateTrainingPayload(valid()),true);
 assert.equal(validateTrainingPayload({...valid(),revision:2}),true);
 assert.deepEqual(trainingSessionKey(18,'2026-10-23'),['18','2026-10-23']);
});

test('rejects duplicate players, coaches and goalies',()=>{
 for(const patch of [
  {selected:['101','101']},{selectedCoaches:['201','201']},
  {goalies:['101','101'],goalieCount:2}
 ]) assert.equal(validateTrainingPayload({...valid(),...patch}),false);
});

test('rejects goalies not selected, invalid goalie count and goalies allocated as skaters',()=>{
 for(const patch of [
  {goalies:['999']},{goalieCount:2},{goalieCount:-1},
  {allocation:[['101']]},{allocation:[['102'],['102']]}
 ]) assert.equal(validateTrainingPayload({...valid(),...patch}),false);
});

test('rejects malformed player IDs, invalid revisions and unknown properties',()=>{
 for(const patch of [
  {selected:['0']},{selected:['abc']},{selected:[101]},
  {revision:-1},{revision:1.5},{unexpected:true}
 ]) assert.equal(validateTrainingPayload({...valid(),...patch}),false);
 assert.equal(validateTrainingPayload(null),false);
 assert.equal(validateTrainingPayload([]),false);
});

test('rejects oversized selections and invalid allocation groups',()=>{
 assert.equal(validateTrainingPayload({...valid(),selected:Array.from({length:201},(_,i)=>String(i+1))}),false);
 assert.equal(validateTrainingPayload({...valid(),allocation:[[],[],[],[]]}),true);
 assert.equal(validateTrainingPayload({...valid(),allocation:[[],[],[],[],[]]}),false);
 assert.equal(validateTrainingPayload({...valid(),allocation:[['999']]}),false);
});

test('training key rejects malformed dates',()=>{
 for(const date of ['20261023','2026-10-23-extra',''])assert.throws(()=>trainingSessionKey(18,date));
});
