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
 if(/\b(?:match|träningsmatch|matcher)\b/u.test(title))categories.matchWord++;
 if(/\b(?:mot|vs|versus)\b/u.test(title))categories.versusWord++;
 if(/\bpoolspel\b/u.test(title))categories.poolWord++;
}
console.log('SvenskaLag feed summary categories (counts only): '+JSON.stringify(categories));

// Privacy-safe taxonomy of match-related titles. Never print title contents.
const matchTitleForms={prefixMatch:0,containsMatch:0,fixtureSeparator:0,opponentMarker:0};
for(const title of summaries){
 if(/^\s*(?:match|träningsmatch)\b/u.test(title))matchTitleForms.prefixMatch++;
 else if(/\bmatch\b/u.test(title))matchTitleForms.containsMatch++;
 if(/\s+[-–]\s+/u.test(title))matchTitleForms.fixtureSeparator++;
 if(/\b(?:mot|vs|versus)\b/u.test(title))matchTitleForms.opponentMarker++;
}
console.log('SvenskaLag match title forms (counts only): '+JSON.stringify(matchTitleForms));

// Counts only; no event title, date or identity is printed.
const matchSyntax={total:0,colon:0,dash:0,space:0,bare:0};
for(const title of summaries){
 const rest=title.replace(/^match\b/u,'');
 if(rest===title)continue;
 matchSyntax.total++;
 if(!rest.trim())matchSyntax.bare++;
 else if(rest.trimStart().startsWith(':'))matchSyntax.colon++;
 else if(rest.trimStart().startsWith('-'))matchSyntax.dash++;
 else matchSyntax.space++;
}
console.log('Match syntax counts only: '+JSON.stringify(matchSyntax));

// Match detail shape, aggregated only. Never log opponents or title text.
const fixtureShape={total:0,empty:0,teamSeparator:0,versusSeparator:0,parentheses:0,other:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 fixtureShape.total++;
 const detail=title.slice(6).trim();
 if(!detail)fixtureShape.empty++;
 else if(/\s+[-–]\s+/u.test(detail))fixtureShape.teamSeparator++;
 else if(/\s+(?:vs\.?|mot|versus)\s+/u.test(detail))fixtureShape.versusSeparator++;
 else if(/[()]/u.test(detail))fixtureShape.parentheses++;
 else fixtureShape.other++;
}
console.log('Match fixture shape counts only: '+JSON.stringify(fixtureShape));

// Aggregate NSK naming patterns only; never log team names.
const fixtureTeams={total:0,nskLeft:0,nskRight:0,nykopingLeft:0,nykopingRight:0,neither:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 const sides=title.slice(6).split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 fixtureTeams.total++;
 const [left,right]=sides.map(x=>x.trim());
 const isNsk=x=>/\bnsk\b/u.test(x);
 const isNyk=x=>/nyköping/u.test(x);
 if(isNsk(left))fixtureTeams.nskLeft++;
 if(isNsk(right))fixtureTeams.nskRight++;
 if(isNyk(left))fixtureTeams.nykopingLeft++;
 if(isNyk(right))fixtureTeams.nykopingRight++;
 if(!isNsk(left)&&!isNsk(right)&&!isNyk(left)&&!isNyk(right))fixtureTeams.neither++;
}
console.log('Fixture team identity counts only: '+JSON.stringify(fixtureTeams));

// Count recognized Nyköping team-name shapes without exposing any names.
const nykopingShapes={exactSK:0,exactSportklubb:0,skWithSuffix:0,sportklubbWithSuffix:0,other:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 const sides=title.slice(6).split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 for(const side of sides){
  const name=side.trim();
  if(!name.includes('nyköping'))continue;
  if(/^nyköpings?\s+sk$/u.test(name))nykopingShapes.exactSK++;
  else if(/^nyköpings?\s+sportklubb$/u.test(name))nykopingShapes.exactSportklubb++;
  else if(/^nyköpings?\s+sk\s+\S/u.test(name))nykopingShapes.skWithSuffix++;
  else if(/^nyköpings?\s+sportklubb\s+\S/u.test(name))nykopingShapes.sportklubbWithSuffix++;
  else nykopingShapes.other++;
 }
}
console.log('Nykoping team name shapes (counts only): '+JSON.stringify(nykopingShapes));

// Distinguish known Team 18/U9 suffix from other club squads; aggregate only.
const squadShape={team18:0,u9:0,otherNumber:0,unknownSuffix:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 const sides=title.slice(6).split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 for(const side of sides){
  const name=side.trim();
  if(!/^nyköpings?\s+sportklubb\s+/u.test(name))continue;
  if(/(?:^|\W)team\s*18(?:\W|$)/u.test(name))squadShape.team18++;
  else if(/(?:^|\W)u\s*9(?:\W|$)/u.test(name))squadShape.u9++;
  else if(/\d/u.test(name))squadShape.otherNumber++;
  else squadShape.unknownSuffix++;
 }
}
console.log('Nykoping squad suffix counts only: '+JSON.stringify(squadShape));

 // Aggregate-only diagnosis of why U9 fixture summaries are excluded by the parser.
const fixtureGates={total:0,recognizedSquad:0,unrecognizedSquad:0,excludedTitle:0,datedFuture:0,datedPast:0,missingDate:0};
const lines=calendar.replace(/\r\n[ \t]|\n[ \t]/g,'').replace(/\r\n?/g,'\n').split('\n');
let record=null;
for(const line of lines){
 if(line==='BEGIN:VEVENT'){record={};continue;}
 if(line==='END:VEVENT'){
  if(record?.SUMMARY?.toLowerCase().startsWith('match:')){
   fixtureGates.total++;
   const title=record.SUMMARY.toLowerCase();
   const sides=title.slice(6).split(/\s+[-–]\s+/u);
   const nsk=sides.filter(s=>/^nyköpings\s+sportklubb\s+.+/u.test(s.trim())&&/(?:^|\W)(?:u\s*9|team\s*18)(?:\W|$)/u.test(s));
   if(nsk.length===1)fixtureGates.recognizedSquad++;else fixtureGates.unrecognizedSquad++;
   if(/inställt|anmälan|cancelled|canceled|fotografering/u.test(title))fixtureGates.excludedTitle++;
   const date=record.DTSTART?.slice(0,8);
   if(!/^\d{8}$/.test(date||''))fixtureGates.missingDate++;
   else if(date>=today.replaceAll('-',''))fixtureGates.datedFuture++;
   else fixtureGates.datedPast++;
  }
  record=null;continue;
 }
 if(record){const idx=line.indexOf(':');if(idx>=0){const k=line.slice(0,idx).split(';')[0];if(k==='SUMMARY'||k==='DTSTART')record[k]=line.slice(idx+1);}}
}
console.log('Match import gate counts only: '+JSON.stringify(fixtureGates));

const matchParseGates={total:0,validDate:0,validTime:0,recognizedOpponent:0,recognizedFuture:0};
const blocks=calendar.replace(/\r\n[ \t]|\n[ \t]/g,'').replace(/\r\n?/g,'\n').split('BEGIN:VEVENT').slice(1);
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const title=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^match:/i.test(title))continue;
 matchParseGates.total++;
 const dateValue=event.match(/^DTSTART(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(/^\d{8}(?:T\d{6}Z?)?$/.test(dateValue))matchParseGates.validDate++;
 if(/^\d{8}T\d{6}Z?$/.test(dateValue))matchParseGates.validTime++;
 const parsed=parseSvenskalagIcal('BEGIN:VCALENDAR\n'+event+'\nEND:VCALENDAR','2000-01-01');
 if(parsed.some(x=>x.type==='match'))matchParseGates.recognizedOpponent++;
 if(parsed.some(x=>x.type==='match'&&x.date>=today))matchParseGates.recognizedFuture++;
}
console.log('Individual match parser gates (counts only): '+JSON.stringify(matchParseGates));
