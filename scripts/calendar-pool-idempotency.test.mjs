import test from 'node:test';
import assert from 'node:assert/strict';
import {ShiftLock} from '../worker/production-api-v42-reference.js';

const mapping={lag:991001,spelare:991002,tranare:991003,poolspel:991004,
  matcher:991005,laguppstallningar:991006,bytesschema:991007,
  malvaktsstatistik:991008,spelaretranare:991009,matchkonfiguration:991010};
const env={BASEROW_TOKEN:'fixture-token',BASEROW_TABLE_IDS:JSON.stringify(mapping)};
const key='12345678-1234-4123-8123-123456789abc';
const payload={Namn:'Poolspel test',Plats:'Nyköping',Datum:'2026-11-01','Antal lag':2,'Antal matcher':3};
const body={action:'calendarPoolCreate',key,teamId:71,payload};
const storage=()=>{const records=new Map();return {get:async k=>records.get(k),put:async(k,v)=>{records.set(k,v)}}};
const send=(lock,requestBody=body)=>lock.fetch(new Request('https://shift-lock.internal/',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(requestBody)
}));

test('calendar pool create is serial and returns original pool on retry',async()=>{
  const previous=globalThis.fetch;let writes=0;
  globalThis.fetch=async(_input,options)=>{
    assert.equal(options.method,'POST');
    writes++;
    return Response.json({id:501,Namn:'Poolspel test'},{status:201});
  };
  try {
    const lock=new ShiftLock({storage:storage()},env);
    const [first,second]=await Promise.all([send(lock),send(lock)]);
    assert.deepEqual([first.status,second.status],[201,200]);
    assert.equal((await second.json()).row.id,501);
    assert.equal(writes,1);
    const changed=await send(lock,{...body,payload:{...payload,Namn:'Ett annat poolspel'}});
    assert.equal(changed.status,409);
    assert.equal(writes,1);
  }finally{globalThis.fetch=previous}
});

test('uncertain calendar pool result blocks retry rather than creating duplicate',async()=>{
  const previous=globalThis.fetch;let writes=0;
  globalThis.fetch=async()=>{writes++;throw new Error('connection lost after write')};
  try{
    const lock=new ShiftLock({storage:storage()},env);
    assert.equal((await send(lock)).status,503);
    assert.equal((await send(lock)).status,409);
    assert.equal(writes,1);
  }finally{globalThis.fetch=previous}
});
