import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {fixture} from './helpers/auth-d1-fixture.mjs';import {createTrainingHandler} from '../worker/training-sessions-api.js';import {withSweHockey} from '../worker/swehockey-schedule.js';

test('SweHockey-only cards have persistent keys, archive and permanently remove through the real calendar endpoint',async t=>{
 const f=await fixture(t);for(const sql of readFileSync(new URL('../migrations/20261024_svenskalag_calendar_events.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await f.db.prepare(sql).run();
 await f.db.prepare('CREATE TABLE swehockey_schedule_cache(team_id TEXT PRIMARY KEY,items_json TEXT,updated_at TEXT)').run();await f.db.prepare('INSERT INTO auth_user_permissions VALUES(?,?)').bind(f.root,'pool:create').run();
 const date='2099-11-07',a={type:'pool',source:'swehockey',activityId:'swehockey:21963:1:2',date,place:'',hall:'',matches:[{opponent:'Åker/Strängnäs HC Röd',startTime:'12:30'}]},b={...a,activityId:'swehockey:21963:3:4',place:'Other rink',matches:[{opponent:'Other',startTime:'15:00'}]};
 const write=async pools=>f.db.prepare("INSERT INTO swehockey_schedule_cache VALUES('NSK Team 18',?,'now') ON CONFLICT(team_id) DO UPDATE SET items_json=excluded.items_json").bind(JSON.stringify(pools)).run();await write([a,b]);
 const env={...f.env,NSK_ENABLE_SWEHOCKEY_SYNC:'true'},training=createTrainingHandler(env,async()=>[{id:18,Namn:'NSK Team 18','Säsong':'2026'}]),handler=withSweHockey(training);
 const call=(action,body,include=true)=>handler(new Request('https://test/api/training?team_id=18&action='+action+(include?'&include_removed=1':''),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+f.tokens.root,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{});
 const list=async include=>(await(await call('svenskalag-saved',null,include)).json()).items;
 let items=await list(true);assert.equal(items.length,2);const key=items.find(p=>p.activityId===a.activityId).key;assert.ok(key.startsWith('swehockey-pool:'));assert.ok(items.find(p=>p.activityId===a.activityId).sourceKeys.includes(key));
 let response=await call('calendar-pool-visibility',{keys:[key]});assert.equal(response.status,200,await response.clone().text());items=await list(true);assert.equal(items.filter(p=>p.calendarHidden).length,1);assert.equal((await list(false)).length,1);
 await write([{...a,matches:[...a.matches,{opponent:'Linden',startTime:'13:00'}]},b]);items=await list(true);assert.equal(items.find(p=>p.activityId===a.activityId).calendarHidden,true);assert.equal(items.find(p=>p.activityId===a.activityId).matches.length,2);
 response=await call('calendar-pool-visibility',{keys:[key],hidden:false});assert.equal(response.status,200);assert.equal((await list(false)).length,2);
 await call('calendar-pool-visibility',{keys:[key]});await write([b]);items=await list(true);assert.ok(items.some(p=>p.key===key&&p.calendarHidden),'archived snapshot survives schedule disappearance');
 response=await call('calendar-pool-visibility',{keys:[key],permanent:true});assert.equal(response.status,200);await write([a,b]);items=await list(true);assert.equal(items.length,1);assert.equal(items[0].activityId,b.activityId);
 response=await call('calendar-pool-visibility',{keys:['swehockey-pool:made-up:2099-11-07']});assert.equal(response.status,409);
});
