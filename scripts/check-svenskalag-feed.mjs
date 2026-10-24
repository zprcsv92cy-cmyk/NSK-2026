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
if(!events.length)throw Error('No eligible upcoming training or pool events; check real feed classification');
console.log('SvenskaLag feed accessible and parsed successfully; '+events.length+' future training/pool activities detected. No event details retained.');
