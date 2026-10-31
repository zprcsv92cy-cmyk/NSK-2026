import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {createTrainingHandler} from '../worker/training-sessions-api.js';
import {syncCalendarCache} from '../worker/svenskalag-calendar-cache.js';

test('calendar removal is authorized, shared, undoable and preserved by feed refresh',async t=>{
 const f=await fixture(t);for(const sql of readFileSync(new URL('../migrations/20261024_svenskalag_calendar_events.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await f.db.prepare(sql).run();
 const date='2099-11-07';const pool={type:'pool',date,place:'Smehallen',matches:[]};await syncCalendarCache(f.db,'NSK Team 18',[pool]);
 const rows=await f.db.prepare('SELECT event_key FROM svenskalag_calendar_events').all(),key=rows.results[0].event_key;
 const handler=createTrainingHandler(f.env,async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]);
 const call=(action,method='GET',body,token=f.tokens.root)=>handler(new Request('https://test/api/training?team_id=18&action='+action,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}));
 // Root is the principal owner; explicit pool permissions cover regular coaches.
 let response=await call('calendar-pool-visibility','POST',{keys:[key]});assert.equal(response.status,403);
 await f.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(f.root,'pool:create').run();
 response=await call('calendar-pool-visibility','POST',{keys:[key]});assert.equal(response.status,200,await response.clone().text());
 assert.equal((await(await call('svenskalag-saved')).json()).items.length,0);
 await syncCalendarCache(f.db,'NSK Team 18',[{...pool,notice:'Updated schedule'}]);assert.equal((await(await call('svenskalag-saved')).json()).items.length,0);
 response=await call('calendar-pool-visibility','POST',{keys:[key],hidden:false});assert.equal(response.status,200);assert.equal((await(await call('svenskalag-saved')).json()).items.length,1);
 response=await call('calendar-pool-visibility','POST',{keys:['missing']});assert.equal(response.status,409);
 response=await call('calendar-pool-visibility','POST',{keys:[key]},'invalid');assert.equal(response.status,401);
});
