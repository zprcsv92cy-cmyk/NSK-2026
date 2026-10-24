import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const worker=readFileSync(new URL('../worker/production-api-v42-reference.js',import.meta.url),'utf8');
const db=readFileSync(new URL('../db.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('schedule-only Baserow writes exclude lineup and goalie fields',()=>{
  const start=worker.indexOf('if (body.schedule_only === true)');
  const end=worker.indexOf('if (!positive(body.player_count)',start);
  assert.ok(start>=0 && end>start,'schedule-only handler exists');
  const branch=worker.slice(start,end);
  assert.match(branch,/req\.method !== "POST"/);
  assert.match(branch,/const draftPayload=/);
  assert.doesNotMatch(branch,/draftPayload[^;]*?(?:Målvakt|Spelare på plan|Antal spelare)/);
  assert.match(branch,/if\(duplicate\)/);
  assert.match(branch,/draftResp\\.ok/);
  const payloadStart=branch.indexOf('const draftPayload=');
  const payloadEnd=branch.indexOf(';',payloadStart);
  const payload=branch.slice(payloadStart,payloadEnd);
  for(const field of ['Poolspel','Lagnummer','Matchnummer','Starttid','Plan']){
    assert.ok(payload.includes(field),'required schedule field '+field);
  }
  assert.match(payload,/Motst\\\\xE5ndare/);
  for(const field of ['player_count','goalie_player_id','players_on_field','Antal spelare','Målvakt','Spelare på plan']){
    assert.ok(!payload.includes(field),'schedule must not require '+field);
  }
});

test('calendar match validation uses actual digits and HH:mm',()=>{
  const start=db.indexOf('async function saveCalendarMatchSchedule');
  const end=db.indexOf('async function savePoolTeamMatchConfig',start);
  assert.ok(start>=0&&end>start);
  const method=db.slice(start,end);
  assert.match(method,/start_time/);
  assert.match(method,/schedule_only:true/);
  assert.doesNotMatch(method,/\\\\d/,'double escaped digit regex would reject valid times');
  assert.match(app,/nsk2_calendar_match_pending/);
});

test('calendar import keeps source until all writes succeed',()=>{
  const start=app.indexOf("const pending=sessionStorage.getItem('nsk2_calendar_match_pending')");
  assert.ok(start>=0);
  const section=app.slice(start,start+2400);
  const remove=section.indexOf("sessionStorage.removeItem('nsk2_calendar_match_pending')");
  const errors=section.indexOf('if(errors.length)');
  assert.ok(remove>errors,'pending data must only be cleared after checking write errors');
});
