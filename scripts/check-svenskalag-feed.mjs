// Live calendar connectivity smoke test. Never logs or stores calendar entries.
import {parseSvenskalagIcal} from '../worker/svenskalag-ical.js';

const endpoint='https://cal.svenskalag.se/103684';
const response=await fetch(endpoint,{headers:{Accept:'text/calendar'},signal:AbortSignal.timeout(12000)});
if(!response.ok)throw Error('SvenskaLag calendar GET failed (HTTP '+response.status+')');
if(new URL(response.url).hostname!=='cal.svenskalag.se')throw Error('Unexpected calendar redirect');
const length=Number(response.headers.get('content-length')||0);
if(length>1024*1024)throw Error('Calendar feed exceeds size limit');
const calendar=await response.text();
if(calendar.length>1024*1024)throw Error('Calendar feed exceeds size limit');
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const events=parseSvenskalagIcal(calendar,today);
if(!calendar.includes('BEGIN:VEVENT'))throw Error('Calendar has no VEVENT entries');
const counts={training:0,pool:0,match:0};
for(const event of events)if(Object.hasOwn(counts,event.type))counts[event.type]++;
if(!events.length)throw Error('No eligible upcoming training, pool or match events; check real feed classification');
console.log('SvenskaLag feed accessible: '+counts.training+' trainings, '+counts.pool+' pools, '+counts.match+' matches. No dates, names, locations or raw calendar logged.');

// Aggregate-only diagnostic: reveal whether the public feed contains standalone
// fixture entries at all, without logging event titles, dates or identities.
const summaries=[...calendar.matchAll(/^SUMMARY(?:;[^:]*)?:(.*)$/gm)].map(m=>m[1].toLocaleLowerCase('sv-SE'));
const categories={total:summaries.length,matchWord:0,versusWord:0,poolWord:0};
for(const title of summaries){
 if(/\\b(?:match|träningsmatch|matcher)\\b/u.test(title))categories.matchWord++;
 if(/\\b(?:mot|vs|versus)\\b/u.test(title))categories.versusWord++;
 if(/\\bpoolspel\\b/u.test(title))categories.poolWord++;
}
console.log('SvenskaLag feed summary categories (counts only): '+JSON.stringify(categories));
