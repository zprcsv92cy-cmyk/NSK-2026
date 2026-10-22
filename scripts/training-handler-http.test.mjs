import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingHandler} from '../worker/training-sessions-api.js';

const handler=createTrainingHandler({AUTH_DB:{}},async()=>[]);
const request=(path,method='GET',token)=>new Request('https://preview.example'+path,{method,headers:token?{Authorization:token}:undefined});

test('training API denies unauthenticated reads and writes',async()=>{
 for(const method of ['GET','PUT']){
  const path='/api/training?team_id=18'+(method==='PUT'?'&date=2026-10-22':'');
  const response=await handler(request(path,method));
  assert.equal(response.status,401,method);
 }
});

test('training API rejects malformed team IDs, duplicate parameters and invalid dates',async()=>{
 for(const path of ['/api/training?team_id=0','/api/training?team_id=18&team_id=19','/api/training?team_id=18&date=2026-10-22&date=2026-10-23','/api/training?team_id=18&date=2026-10-22-01']){
  assert.equal((await handler(request(path))).status,400,path);
 }
});

test('training API rejects unsupported methods and unknown routes',async()=>{
 assert.equal((await handler(request('/api/training?team_id=18','DELETE'))).status,405);
 assert.equal((await handler(request('/api/other?team_id=18'))).status,404);
});


test('training API denies malformed Bearer credentials before database access',async()=>{
 for(const token of ['Bearer','Bearer ','Basic abc','Bearer abc def','Bearer abc\\tdef']){
  const response=await handler(request('/api/training?team_id=18','GET',token));
  assert.equal(response.status,401,token);
 }
});

test('training API rejects writes without a date before authorization',async()=>{
 assert.equal((await handler(request('/api/training?team_id=18','PUT','Bearer token'))).status,400);
});
