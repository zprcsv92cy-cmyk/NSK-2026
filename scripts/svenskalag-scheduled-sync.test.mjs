import test from 'node:test';
import assert from 'node:assert/strict';
import {runSvenskalagScheduledSync} from '../worker/svenskalag-scheduled-sync.js';

test('scheduled sync does not fetch or write when disabled',async()=>{
 const result=await runSvenskalagScheduledSync({NSK_ENABLE_SVENSKALAG_AUTO_SYNC:'false'});
 assert.deepEqual(result,{skipped:'disabled'});
});
test('scheduled sync refuses missing team binding and database',async()=>{
 await assert.rejects(runSvenskalagScheduledSync({NSK_ENABLE_SVENSKALAG_AUTO_SYNC:'true'}),/configuration incomplete/);
});
