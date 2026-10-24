import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSvenskalagIcal} from '../worker/svenskalag-ical.js';

const ical=events=>'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'+events.map(e=>'BEGIN:VEVENT\r\n'+e.join('\r\n')+'\r\nEND:VEVENT\r\n').join('')+'END:VCALENDAR\r\n';
test('SvenskaLag feed includes only actual trainings and pools',()=>{
 const events=[
 ['SUMMARY:Träning','DTSTART;TZID=Europe/Stockholm:20261101T180000','LOCATION:Lilla Hallen'],
 ['SUMMARY:Is 17/18','DTSTART:20261109T175500','LOCATION:Stora hallen'],
 ['SUMMARY:Poolspel','DTSTART:20261122T120000','LOCATION:Månsbrorinken'],
 ['SUMMARY:Poolspel - intresseanmälan','DTSTART:20261121T110000','LOCATION:Södertälje'],
 ['SUMMARY:Hockeyfritids','DTSTART:20261103T130000','LOCATION:Stora hallen'],
 ['SUMMARY:Fotografering','DTSTART:20261111T180000'],
 ['SUMMARY:Match mot Södertälje','DTSTART:20261129T120000','LOCATION:Annan hall']
 ];
 const result=parseSvenskalagIcal(ical(events),'2026-10-24');
 assert.equal(result.length,3);
 assert.deepEqual(result.map(x=>x.type),['training','training','pool']);
 assert.equal(result[2].place,'Månsbrorinken');
 assert.equal(result[0].hall,'Lilla Hallen');
});
test('UTC midnight adjacent dates convert to Stockholm day',()=>{
 const events=[['SUMMARY:Poolspel','DTSTART:20261024T230000Z','LOCATION:Smehallen']];
 const [item]=parseSvenskalagIcal(ical(events),'2026-10-24');
 assert.equal(item.date,'2026-10-25');
});
test('Folded ICS lines are decoded without retaining description or attendees',()=>{
 const input=ical([['SUMMARY:Poolspel','DTSTART:20261121T100000','LOCATION:Strängnäs',' Ishall','DESCRIPTION:Private details','ATTENDEE:mailto:someone@example.test']]);
 const [item]=parseSvenskalagIcal(input,'2026-10-24');
 assert.equal(item.place,'SträngnäsIshall');
 assert.ok(!JSON.stringify(item).includes('Private'));
 assert.ok(!JSON.stringify(item).includes('someone'));
});
test('Two different training events on one day require manual resolution',()=>{
 const result=parseSvenskalagIcal(ical([
 ['SUMMARY:Träning','DTSTART:20261111T170000','LOCATION:Stora hallen'],
 ['SUMMARY:Is 17/18','DTSTART:20261111T180000','LOCATION:Lilla Hallen']
 ]),'2026-10-24');
 assert.equal(result.length,1);
 assert.equal(result[0].multipleSessions,true);
});
test('Invalid feeds and nonexistent dates are never imported',()=>{
 assert.throws(()=>parseSvenskalagIcal('not an ICS file','2026-10-24'));
 assert.equal(parseSvenskalagIcal(ical([['SUMMARY:Poolspel','DTSTART:20261131T180000','LOCATION:Smehallen']]),'2026-10-24').length,0);
});
test('Calendar subscription uses authenticated review and existing confirmation',()=>{
 const front=readFileSync(new URL('../home-training.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../startsida/index.html',import.meta.url),'utf8');
 const api=readFileSync(new URL('../worker/training-sessions-api.js',import.meta.url),'utf8');
 assert.match(html,/trainingCalendarFeedRead/);
 assert.match(html,/trainingCalendarFeedMonth/);
 assert.match(front,/action=svenskalag-calendar/);
 assert.match(front,/await showCandidates\(\{month:feedMonth.value/);
 assert.match(front,/await showCandidates\(parsed\)/);
 assert.match(api,/if\(request.method==='GET'&&url.searchParams.get\('action'\)==='svenskalag-calendar'\)/);
 assert.ok(api.indexOf("if(request.method==='GET'&&url.searchParams.get('action')")>api.indexOf("!access.permissions.includes('read')"));
});

test('Explicit match opponent and local start are read without creating poolspel',()=>{
 const feed=ical([
  ['SUMMARY:Match mot Södertälje SK','DTSTART;TZID=Europe/Stockholm:20261114T174500','LOCATION:Södertälje'],
  ['SUMMARY:Match mot Nyköpings SK','DTSTART:20261121T170000Z','LOCATION:Rosvalla'],
  ['SUMMARY:Match mot','DTSTART:20261122T140000','LOCATION:Unknown'],
  ['SUMMARY:Träningsmatch anmälan','DTSTART:20261123T140000']
 ]);
 const matches=parseSvenskalagIcal(feed,'2026-10-24').filter(x=>x.type==='match');
 assert.equal(matches.length,2);
 assert.deepEqual(matches.map(m=>[m.date,m.startTime,m.opponent]),[
  ['2026-11-14','17:45','Södertälje SK'],['2026-11-21','18:00','Nyköpings SK']
 ]);
});
test('Same-day matches with distinct opponents remain separate',()=>{
 const result=parseSvenskalagIcal(ical([
  ['SUMMARY:Match mot Lag A','DTSTART:20261114T120000','LOCATION:Hall A'],
  ['SUMMARY:Match mot Lag B','DTSTART:20261114T120000','LOCATION:Hall A']
 ]),'2026-10-24');
 assert.equal(result.filter(x=>x.type==='match').length,2);
});
test('Match calendar review remains read-only for pool match configuration',()=>{
 const front=readFileSync(new URL('../home-training.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../startsida/index.html',import.meta.url),'utf8');
 assert.match(html,/id="trainingCalendarMatches"/);
 assert.match(front,/item.type==='match'/);
 assert.match(front,/match.startTime/);
 assert.match(front,/match.opponent/);
 assert.match(front,/Matcherna visas endast och sparas inte/);
});
