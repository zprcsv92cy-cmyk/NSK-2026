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

const matchShapeGates={total:0,exactMatchPrefix:0,splitTwoSides:0,sideStartsNykopings:0,sideStartsNykoping:0,explicitU9:0,recognizedNskExact:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 matchShapeGates.total++;
 if(/^(?:match|träningsmatch)\s*[:–-]\s*(.+)$/iu.test(title))matchShapeGates.exactMatchPrefix++;
 const sides=title.slice(6).trim().split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 matchShapeGates.splitTwoSides++;
 for(const side of sides){
  if(/^nyköpings\s+sportklubb\b/u.test(side))matchShapeGates.sideStartsNykopings++;
  if(/^nyköping\s+sportklubb\b/u.test(side))matchShapeGates.sideStartsNykoping++;
  if(/(?:^|\W)u\s*9(?:\W|$)/u.test(side))matchShapeGates.explicitU9++;
  if(/^(?:nsk|nyköpings\s+(?:sk|sportklubb))(?:\s+(?:u\s*9|team\s*18|u9\s*team\s*18))?$/iu.test(side.trim()))matchShapeGates.recognizedNskExact++;
 }
}
console.log('Fixture parser regex gates (counts only): '+JSON.stringify(matchShapeGates));

const matchSuffixTokens={total:0,containsU9:0,hasExactU9Token:0,containsTeam18:0,hasOtherDigits:0,hasParentheses:0,hasUnderscore:0,hasSlash:0,hasComma:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 const sides=title.slice(6).trim().split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 const side=sides.find(x=>/^nyköpings\s+sportklubb\b/u.test(x.trim()));
 if(!side)continue;
 const suffix=side.trim().replace(/^nyköpings\s+sportklubb\s*/u,'');
 matchSuffixTokens.total++;
 if(/u\s*9/u.test(suffix))matchSuffixTokens.containsU9++;
 if(/(?:^|\W)u\s*9(?:\W|$)/u.test(suffix))matchSuffixTokens.hasExactU9Token++;
 if(/team\s*18/u.test(suffix))matchSuffixTokens.containsTeam18++;
 if(/\d/u.test(suffix.replace(/u\s*9|team\s*18/gu,'')))matchSuffixTokens.hasOtherDigits++;
 if(/[()]/u.test(suffix))matchSuffixTokens.hasParentheses++;
 if(/_/u.test(suffix))matchSuffixTokens.hasUnderscore++;
 if(/\//u.test(suffix))matchSuffixTokens.hasSlash++;
 if(/,/u.test(suffix))matchSuffixTokens.hasComma++;
}
console.log('Fixture suffix token counts only: '+JSON.stringify(matchSuffixTokens));

const fixtureSideGate={total:0,exactlyTwoSides:0,oneU9Side:0,bothU9Sides:0,otherSideEmpty:0,otherSideContainsNykoping:0,otherSideContainsPool:0,otherSideContainsTraining:0,parsedWhenSyntheticDate:0};
for(const title of summaries){
 if(!title.startsWith('match:'))continue;
 fixtureSideGate.total++;
 const sides=title.slice(6).trim().split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 fixtureSideGate.exactlyTwoSides++;
 const flags=sides.map(s=>/^nyköpings\s+sportklubb\b/u.test(s.trim())&&/(?:^|\W)(?:u\s*9|team\s*18)(?:\W|$)/u.test(s));
 if(flags.every(Boolean)){fixtureSideGate.bothU9Sides++;continue;}
 if(flags.filter(Boolean).length!==1)continue;
 fixtureSideGate.oneU9Side++;
 const other=sides[flags[0]?1:0].trim();
 if(!other)fixtureSideGate.otherSideEmpty++;
 if(/nyköping/u.test(other))fixtureSideGate.otherSideContainsNykoping++;
 if(/poolspel/u.test(other))fixtureSideGate.otherSideContainsPool++;
 if(/träning/u.test(other))fixtureSideGate.otherSideContainsTraining++;
 const safeTitle=title.replace(/\\/g,'');
 const synthetic='BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:'+safeTitle+'\nDTSTART:20261108T100000\nEND:VEVENT\nEND:VCALENDAR';
 if(parseSvenskalagIcal(synthetic,'2026-10-24').some(x=>x.type==='match'))fixtureSideGate.parsedWhenSyntheticDate++;
}
console.log('Fixture side gate counts only: '+JSON.stringify(fixtureSideGate));

const liveMatchDateGates={total:0,parsedAt2000:0,parsedAtCurrent:0,parsedAtEventDay:0,futureAndParsedAt2000:0,unparsedFuture:0,allDayDate:0,localTimed:0,utcTimed:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const title=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^match:/i.test(title))continue;
 liveMatchDateGates.total++;
 const dt=event.match(/^DTSTART(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 const iso=/^\d{8}/.test(dt)?dt.slice(0,4)+'-'+dt.slice(4,6)+'-'+dt.slice(6,8):'';
 if(/^\d{8}$/.test(dt))liveMatchDateGates.allDayDate++;
 if(/^\d{8}T\d{6}$/.test(dt))liveMatchDateGates.localTimed++;
 if(/^\d{8}T\d{6}Z$/.test(dt))liveMatchDateGates.utcTimed++;
 const feed='BEGIN:VCALENDAR\n'+event+'\nEND:VCALENDAR';
 const p2000=parseSvenskalagIcal(feed,'2000-01-01').some(x=>x.type==='match');
 const pnow=parseSvenskalagIcal(feed,today).some(x=>x.type==='match');
 if(p2000)liveMatchDateGates.parsedAt2000++;
 if(pnow)liveMatchDateGates.parsedAtCurrent++;
 if(iso&&parseSvenskalagIcal(feed,iso).some(x=>x.type==='match'))liveMatchDateGates.parsedAtEventDay++;
 if(iso>=today&&p2000)liveMatchDateGates.futureAndParsedAt2000++;
 if(iso>=today&&!p2000)liveMatchDateGates.unparsedFuture++;
}
console.log('Live match date gate counts only: '+JSON.stringify(liveMatchDateGates));

const eventStatusGates={total:0,cancelled:0,confirmed:0,tentative:0,otherStatus:0,containsTraining:0,containsPool:0,excludedKeyword:0,hasSummary:0,hasDtstart:0};
for(const block of blocks){
 const event=block.slice(0,block.indexOf('END:VEVENT'));
 const title=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^match:/i.test(title))continue;
 eventStatusGates.total++;
 if(title)eventStatusGates.hasSummary++;
 if(/^DTSTART(?:;[^:]*)?:/m.test(event))eventStatusGates.hasDtstart++;
 const status=event.match(/^STATUS(?:;[^:]*)?:(.*)$/m)?.[1]?.trim()||'';
 if(status==='CANCELLED')eventStatusGates.cancelled++;
 else if(status==='CONFIRMED')eventStatusGates.confirmed++;
 else if(status==='TENTATIVE')eventStatusGates.tentative++;
 else if(status)eventStatusGates.otherStatus++;
 if(/träning|is\s*1[789]\s*\/\s*1[789]/iu.test(title))eventStatusGates.containsTraining++;
 if(/poolspel/iu.test(title))eventStatusGates.containsPool++;
 if(/hockeyfritids|fotografering|intresseanmälan|intresseanmäl|anmälan|inställt|cancelled|canceled|lagfoto/iu.test(title))eventStatusGates.excludedKeyword++;
}
console.log('Match event status gates (counts only): '+JSON.stringify(eventStatusGates));

const isolatedMatchFields={total:0,summaryAndStartOnly:0,withStatus:0,withLocation:0,fullEvent:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const summary=event.match(/^SUMMARY(?:;[^:]*)?:.*$/m)?.[0]||'';
 if(!/^SUMMARY(?:;[^:]*)?:Match:/i.test(summary))continue;
 isolatedMatchFields.total++;
 const start=event.match(/^DTSTART(?:;[^:]*)?:.*$/m)?.[0]||'';
 const status=event.match(/^STATUS(?:;[^:]*)?:.*$/m)?.[0]||'';
 const location=event.match(/^LOCATION(?:;[^:]*)?:.*$/m)?.[0]||'';
 const wrap=parts=>'BEGIN:VCALENDAR\nBEGIN:VEVENT\n'+parts.filter(Boolean).join('\n')+'\nEND:VEVENT\nEND:VCALENDAR';
 const accepts=feed=>parseSvenskalagIcal(feed,'2000-01-01').some(x=>x.type==='match');
 if(accepts(wrap([summary,start])))isolatedMatchFields.summaryAndStartOnly++;
 if(accepts(wrap([summary,start,status])))isolatedMatchFields.withStatus++;
 if(accepts(wrap([summary,start,location])))isolatedMatchFields.withLocation++;
 if(accepts('BEGIN:VCALENDAR\n'+event+'\nEND:VCALENDAR'))isolatedMatchFields.fullEvent++;
}
console.log('Isolated match field gates (counts only): '+JSON.stringify(isolatedMatchFields));

const escapedMatchSummary={total:0,hasBackslash:0,hasEscapedComma:0,hasEscapedSemicolon:0,hasEscapedNewline:0,rawSummaryParsed:0,unescapedSummaryParsed:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const summary=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^Match:/i.test(summary))continue;
 escapedMatchSummary.total++;
 if(summary.includes('\\'))escapedMatchSummary.hasBackslash++;
 if(summary.includes('\\,'))escapedMatchSummary.hasEscapedComma++;
 if(summary.includes('\\;'))escapedMatchSummary.hasEscapedSemicolon++;
 if(/\\n/i.test(summary))escapedMatchSummary.hasEscapedNewline++;
 const start=event.match(/^DTSTART(?:;[^:]*)?:.*$/m)?.[0]||'';
 const wrap=t=>'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:'+t+'\n'+start+'\nEND:VEVENT\nEND:VCALENDAR';
 if(parseSvenskalagIcal(wrap(summary),'2000-01-01').some(x=>x.type==='match'))escapedMatchSummary.rawSummaryParsed++;
 if(parseSvenskalagIcal(wrap(summary.replace(/\\/g,'')),'2000-01-01').some(x=>x.type==='match'))escapedMatchSummary.unescapedSummaryParsed++;
}
console.log('Escaped fixture summary gates (counts only): '+JSON.stringify(escapedMatchSummary));

const realVersusSyntheticStart={total:0,syntheticAccepted:0,realAccepted:0,dtstartParam:0,dtstartRawLength15:0,dtstartRawLength16:0,dtstartRawOtherLength:0,dtstartHasTrailingWhitespace:0,dtstartHasColon:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const summary=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^Match:/i.test(summary))continue;
 realVersusSyntheticStart.total++;
 const rawStart=event.match(/^(DTSTART(?:;[^:]*)?):(.*)$/m);
 const dt=rawStart?.[2]||'';
 if(rawStart?.[1]?.includes(';'))realVersusSyntheticStart.dtstartParam++;
 if(dt.length===15)realVersusSyntheticStart.dtstartRawLength15++;
 else if(dt.length===16)realVersusSyntheticStart.dtstartRawLength16++;
 else realVersusSyntheticStart.dtstartRawOtherLength++;
 if(dt.trim()!==dt)realVersusSyntheticStart.dtstartHasTrailingWhitespace++;
 if(dt.includes(':'))realVersusSyntheticStart.dtstartHasColon++;
 const wrap=start=>'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:'+summary+'\n'+start+'\nEND:VEVENT\nEND:VCALENDAR';
 if(parseSvenskalagIcal(wrap('DTSTART:20261108T100000'),'2000-01-01').some(x=>x.type==='match'))realVersusSyntheticStart.syntheticAccepted++;
 if(rawStart&&parseSvenskalagIcal(wrap(rawStart[0]),'2000-01-01').some(x=>x.type==='match'))realVersusSyntheticStart.realAccepted++;
}
console.log('Real versus synthetic DTSTART gates (counts only): '+JSON.stringify(realVersusSyntheticStart));

const rawVsNormalizedFixture={total:0,rawAccepted:0,lowercaseAccepted:0,normalizedAccepted:0,containsUppercase:0,hasNonAscii:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const summary=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^Match:/i.test(summary))continue;
 rawVsNormalizedFixture.total++;
 if(summary!==summary.toLocaleLowerCase('sv-SE'))rawVsNormalizedFixture.containsUppercase++;
 if(/[^\x00-\x7F]/u.test(summary))rawVsNormalizedFixture.hasNonAscii++;
 const wrap=t=>'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:'+t+'\nDTSTART:20261108T100000\nEND:VEVENT\nEND:VCALENDAR';
 if(parseSvenskalagIcal(wrap(summary),'2000-01-01').some(x=>x.type==='match'))rawVsNormalizedFixture.rawAccepted++;
 if(parseSvenskalagIcal(wrap(summary.toLocaleLowerCase('sv-SE')),'2000-01-01').some(x=>x.type==='match'))rawVsNormalizedFixture.lowercaseAccepted++;
 if(parseSvenskalagIcal(wrap(summary.normalize('NFKC')),'2000-01-01').some(x=>x.type==='match'))rawVsNormalizedFixture.normalizedAccepted++;
}
console.log('Raw versus normalized fixture gates (counts only): '+JSON.stringify(rawVsNormalizedFixture));

const opponentDecisionGates={total:0,twoSides:0,homeNsk:0,awayNsk:0,bothNsk:0,neitherNsk:0,opponentNonempty:0,matchTitleRecognized:0};
const isNskLikeParser=name=>{
 const squad=name.trim();
 if(/^(?:nsk|nyköpings\s+(?:sk|sportklubb))$/iu.test(squad))return true;
 const suffix=squad.match(/^nyköpings\s+(?:sk|sportklubb)\s+(.+)$/iu)?.[1]||'';
 return /(?:^|\W)(?:u\s*9|team\s*18)(?:\W|$)/iu.test(suffix)
   && !/(?:^|\W)(?:u\s*(?:[1-8]|1\d|2\d)|team\s*(?:[1-9]|1[0-7]|19|2\d))(?:\W|$)/iu.test(suffix);
};
for(const summary of summaries){
 if(!summary.startsWith('match:'))continue;
 opponentDecisionGates.total++;
 const m=summary.match(/^(?:match|träningsmatch)\s*[:–-]\s*(.+)$/iu);
 if(!m)continue;
 opponentDecisionGates.matchTitleRecognized++;
 const sides=m[1].trim().split(/\s+[-–]\s+/u);
 if(sides.length!==2)continue;
 opponentDecisionGates.twoSides++;
 const home=isNskLikeParser(sides[0]),away=isNskLikeParser(sides[1]);
 if(home)opponentDecisionGates.homeNsk++;
 if(away)opponentDecisionGates.awayNsk++;
 if(home&&away)opponentDecisionGates.bothNsk++;
 if(!home&&!away)opponentDecisionGates.neitherNsk++;
 if(home!==away)opponentDecisionGates.opponentNonempty++;
}
console.log('Opponent decision gates (counts only): '+JSON.stringify(opponentDecisionGates));

const fixtureClassification={total:0,explicitMatchExclusion:0,poolDetected:0,trainingDetected:0,opponentSideRecognized:0,parsedOriginal:0,parsedWithoutPoolWord:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const title=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^Match:/i.test(title))continue;
 fixtureClassification.total++;
 if(/^(?:match|träningsmatch)\s*(?::|[-–]|\s+(?:mot|vs\.?|versus)\b)/iu.test(title))fixtureClassification.explicitMatchExclusion++;
 if(!/^(?:match|träningsmatch)\s*(?::|[-–]|\s+(?:mot|vs\.?|versus)\b)/iu.test(title)&&/(^|[^\p{L}])poolspel([^\p{L}]|$)/iu.test(title))fixtureClassification.poolDetected++;
 if(/(^|[^\p{L}])träning([^\p{L}]|$)|(^|[^\p{L}])is\s*1[789]\s*\/\s*1[789]([^\p{L}]|$)/iu.test(title))fixtureClassification.trainingDetected++;
 const parts=title.slice(6).trim().split(/\s+[-–]\s+/u);
 if(parts.length===2&&parts.some(isNskLikeParser))fixtureClassification.opponentSideRecognized++;
 const wrap=t=>'BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:'+t+'\nDTSTART:20261108T100000\nEND:VEVENT\nEND:VCALENDAR';
 if(parseSvenskalagIcal(wrap(title),'2000-01-01').some(x=>x.type==='match'))fixtureClassification.parsedOriginal++;
 if(parseSvenskalagIcal(wrap(title.replace(/poolspel/giu,'')),'2000-01-01').some(x=>x.type==='match'))fixtureClassification.parsedWithoutPoolWord++;
}
console.log('Fixture classification gates (counts only): '+JSON.stringify(fixtureClassification));

const caseIdentity={total:0,rawRecognized:0,lowerRecognized:0,rawSideCountTwo:0,lowerSideCountTwo:0};
for(const block of blocks){
 const event='BEGIN:VEVENT'+block.slice(0,block.indexOf('END:VEVENT')+10);
 const raw=event.match(/^SUMMARY(?:;[^:]*)?:(.*)$/m)?.[1]||'';
 if(!/^Match:/i.test(raw))continue;
 caseIdentity.total++;
 for(const [variant,lower] of [[raw,false],[raw.toLocaleLowerCase('sv-SE'),true]]){
  const sides=variant.slice(6).trim().split(/\s+[-–]\s+/u);
  if(sides.length!==2)continue;
  if(lower)caseIdentity.lowerSideCountTwo++;else caseIdentity.rawSideCountTwo++;
  if(sides.some(isNskLikeParser)){if(lower)caseIdentity.lowerRecognized++;else caseIdentity.rawRecognized++;}
 }
}
console.log('Fixture casing identity gates (counts only): '+JSON.stringify(caseIdentity));
