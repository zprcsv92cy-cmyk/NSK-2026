import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSvenskalagAttendance,previewSvenskalagAttendance} from '../worker/svenskalag-attendance.js';
const eventId='training-2026-11-01';
test('normalizes player and coach responses separately',()=>{
 const result=normalizeSvenskalagAttendance({eventId,participants:[
  {memberId:'1',role:'player',response:'accepted'},
  {memberId:'2',role:'spelare',response:'kommer inte'},
  {memberId:'3',role:'trainer',response:'pending'}
 ]},eventId);
 assert.deepEqual(result,{
  players:[{memberId:'1',response:'kommer'},{memberId:'2',response:'kommer_inte'}],
  coaches:[{memberId:'3',response:'ej_svarat'}]
 });
});
test('rejects guesses, unexpected data, duplicated ids and wrong event',()=>{
 const valid={eventId,participants:[{memberId:'1',role:'player',response:'accepted'}]};
 assert.throws(()=>normalizeSvenskalagAttendance(valid,'other-event'));
 assert.throws(()=>normalizeSvenskalagAttendance({...valid,participants:[{memberId:'1',role:'child',response:'yes'}]},eventId));
 assert.throws(()=>normalizeSvenskalagAttendance({...valid,participants:[{memberId:'1',role:'player',response:'maybe'}]},eventId));
 assert.throws(()=>normalizeSvenskalagAttendance({...valid,participants:[valid.participants[0],valid.participants[0]]},eventId));
});
test('unknown member identity blocks importing, and no private fields are returned',()=>{
 const raw={eventId,participants:[{memberId:'1',role:'player',response:'yes',name:'Private Name',comment:'medical'}, {memberId:'9',role:'coach',response:'no',email:'private@example.test'}]};
 const result=normalizeSvenskalagAttendance(raw,eventId);
 assert.ok(!JSON.stringify(result).includes('Private'));
 assert.ok(!JSON.stringify(result).includes('medical'));
 assert.ok(!JSON.stringify(result).includes('private@example'));
 const preview=previewSvenskalagAttendance(result,['1'],[]);
 assert.equal(preview.canApply,false);
 assert.equal(preview.unmapped,1);
 assert.equal(preview.players[0].response,'kommer');
});
