import test from 'node:test';
import assert from 'node:assert/strict';
import { ShiftLock } from '../worker/production-api-v42-reference.js';

test('concurrent schedule-only creates serialize and reject duplicate', async () => {
  const ids = {
    lag: 991001, spelare: 991002, tranare: 991003, poolspel: 991004,
    matcher: 991005, laguppstallningar: 991006, bytesschema: 991007,
    malvaktsstatistik: 991008, spelaretranare: 991009, matchkonfiguration: 991010
  };
  const env = { BASEROW_TOKEN:'fixture-token', BASEROW_TABLE_IDS:JSON.stringify(ids) };
  const originalFetch = globalThis.fetch;
  let records=[], writes=0;
  globalThis.fetch = async (input, options={}) => {
    const url=new URL(String(input));
    const table=Number(url.pathname.match(/table\/(\d+)/)?.[1]);
    const method=options.method||'GET';
    if(table===ids.poolspel && method==='GET')
      return Response.json({id:51,Lag:[{id:71}],'Antal lag':2,'Antal matcher':8});
    if(table===ids.lag && method==='GET')
      return Response.json({id:71,Namn:'NSK Team 18'});
    if(table===ids.matchkonfiguration && method==='GET')
      return Response.json({results:records.map(x=>({...x})),next:null});
    if(table===ids.matchkonfiguration && method==='POST'){
      writes++;
      const body=JSON.parse(options.body);
      const record={id:101, ...body};
      records.push(record);
      return Response.json(record,{status:201});
    }
    throw new Error('Unexpected fixture fetch '+url+' '+method);
  };
  try {
    const lock=new ShiftLock({},env);
    const payload={action:'scheduleCreate',pool_id:51,lag_no:1,match_no:1,
      start_time:'10:15',opponent:'Testmotståndare',plan:'Plan 1'};
    const send=()=>lock.fetch(new Request('https://shift-lock.internal/',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)
    }));
    const results=await Promise.all([send(),send()]);
    assert.deepEqual(results.map(x=>x.status).sort((a,b)=>a-b),[201,409]);
    assert.equal(writes,1);
    assert.equal(records[0]['Motståndare'],'Testmotståndare');
    assert.equal(Object.hasOwn(records[0],'Målvakt'),false);
    assert.equal(Object.hasOwn(records[0],'Spelare på plan'),false);
  } finally {
    globalThis.fetch=originalFetch;
  }
});
