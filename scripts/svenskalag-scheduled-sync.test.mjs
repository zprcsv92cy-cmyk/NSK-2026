import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fixture} from './helpers/auth-d1-fixture.mjs';
import {runSvenskalagScheduledSync} from '../worker/svenskalag-scheduled-sync.js';
import {syncCalendarCache} from '../worker/svenskalag-calendar-cache.js';

test('scheduled sync does not fetch or write when disabled',async()=>{
 const result=await runSvenskalagScheduledSync({NSK_ENABLE_SVENSKALAG_AUTO_SYNC:'false'});
 assert.deepEqual(result,{skipped:'disabled'});
});
test('scheduled sync refuses missing team binding and database',async()=>{
 await assert.rejects(runSvenskalagScheduledSync({NSK_ENABLE_SVENSKALAG_AUTO_SYNC:'true'}),/configuration incomplete/);
});

test('sync removes a missing future source training within the feed horizon and preserves other entries',async t=>{
 const {db}=await fixture(t);
 const migration=readFileSync(new URL('../migrations/20261024_svenskalag_calendar_events.sql',import.meta.url),'utf8');
 for(const sql of migration.replace(/^--.*$/gm,'').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const team='NSK Team 18',today='2026-11-05';
 const training=day=>({type:'training',date:'2026-11-'+day});
 const pool={type:'pool',date:'2026-11-07',place:'Rosvalla'};
 await syncCalendarCache(db,team,['04','05','07','08','09','18'].map(training).concat(pool));
 await db.prepare("UPDATE svenskalag_calendar_events SET manually_edited=1 WHERE event_key='training:2026-11-08'").run();
 assert.equal((await syncCalendarCache(db,team,[pool],today)).deleted,0);
 assert.equal((await syncCalendarCache(db,team,[training('09'),training('11')],today)).deleted,1);
 const keys=await db.prepare('SELECT event_key FROM svenskalag_calendar_events ORDER BY event_key').all();
 assert.deepEqual(keys.results.map(row=>row.event_key),[
  'pool:2026-11-07:rosvalla','training:2026-11-04','training:2026-11-05',
  'training:2026-11-08','training:2026-11-09','training:2026-11-11','training:2026-11-18'
 ]);
 assert.equal((await syncCalendarCache(db,team,[training('07'),training('09'),training('11')],today)).created,1);
});
