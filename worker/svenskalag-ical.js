// Minimal, fail-closed iCalendar decoder for SvenskaLag's public team feed.
// Never return event descriptions, invitees or any attendee information.
const unfold=ical=>String(ical).replace(/\r\n[ \t]|\n[ \t]/g,'').replace(/\r\n?/g,'\n');
const decode=value=>String(value||'').replace(/\\[nN]/g,' ').replace(/\\[,;]/g,m=>m.slice(1)).replace(/\\\\/g,'\\').trim();
function stockholmDate(value){
  if(!/^\d{8}(?:T\d{6}Z?)?$/.test(value))return null;
  const day=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8);
  const date=new Date(day+'T12:00:00Z');
  if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==day)return null;
  if(!value.endsWith('Z'))return day; // DTSTART;TZID=Europe/Stockholm is a local day.
  const instant=new Date(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)+'T'+value.slice(9,11)+':'+value.slice(11,13)+':'+value.slice(13,15)+'Z');
  if(Number.isNaN(instant.valueOf()))return null;
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(instant);
}
function stockholmStartTime(value){
  if(!/^\d{8}T\d{6}Z?$/.test(value))return '';
  const hh=Number(value.slice(9,11)),mm=Number(value.slice(11,13)),ss=Number(value.slice(13,15));
  if(hh>23||mm>59||ss>59)return '';
  if(!value.endsWith('Z'))return value.slice(9,11)+':'+value.slice(11,13);
  const instant=new Date(value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8)+'T'+value.slice(9,11)+':'+value.slice(11,13)+':'+value.slice(13,15)+'Z');
  if(Number.isNaN(instant.valueOf()))return '';
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(instant);
}
function calendarOpponent(title){
  // Accept explicit match/opponent titles; never infer an opponent from a venue.
  const match=title.match(/^(?:match|träningsmatch)\s+(?:mot|vs\.?|versus)\s+(.+)$/i)
    || title.match(/^(?:match|träningsmatch)\s*[:–-]\s*(.+)$/i);
  if(!match)return '';
  const fixture=match[1].trim().split(/\s+[-–]\s+/);
  // SvenskaLag also emits "Match: Opponent - Poolspel U9 ... - Nyköpings Sportklubb".
  // Require an explicit U9 pool marker and the exact club name; reject ambiguous local opponents.
  if(fixture.length===3){
    const [opponent,middle,club]=fixture.map(part=>part.trim());
    if(/^nyköpings\s+(?:sk|sportklubb)$/iu.test(club)
      && /(?:^|\W)poolspel(?:\W|$)/iu.test(middle)
      && /(?:^|\W)u\s*9(?:\W|$)/iu.test(middle)
      && !/(?:^|\W)u\s*(?:[1-8]|1\d|2\d)(?:\W|$)/iu.test(middle)
      && opponent && !/^nyköpings\s+(?:sk|sportklubb)(?:\s|$)/iu.test(opponent)
      && !/^(?:poolspel|okänd|ej angiven)$/iu.test(opponent))return opponent.slice(0,120);
    return '';
  }
  if(fixture.length===2){
    const isNsk=name=>{
      const squad=name.trim();
      if(/^(?:nsk|nyköpings\s+(?:sk|sportklubb))$/iu.test(squad))return true;
      const suffix=squad.match(/^nyköpings\s+(?:sk|sportklubb)\s+(.+)$/iu)?.[1]||'';
      // SvenskaLag may append a squad label to U9. Accept only an explicit U9/Team 18 token.
      return /(?:^|\W)(?:u\s*9|team\s*18)(?:\W|$)/iu.test(suffix)
        && !/(?:^|\W)(?:u\s*(?:[1-8]|1\d|2\d)|team\s*(?:[1-9]|1[0-7]|19|2\d))(?:\W|$)/iu.test(suffix);
    };
    const home=isNsk(fixture[0]),away=isNsk(fixture[1]);
    if(home===away)return ''; // Unknown or both sides NSK: do not guess.
    const other=(home?fixture[1]:fixture[0]).trim();
    return other&&!/^(?:poolspel|okänd|ej angiven)$/i.test(other)?other.slice(0,120):'';
  }
  const opponent=match[1].trim();
  // A fixture such as "Match: Team A - Team B" does not identify our opponent unambiguously.
  if(!opponent || /\s+[-–]\s+/.test(opponent) || /^(?:poolspel|okänd|ej angiven)$/i.test(opponent))return '';
  return opponent.slice(0,120);
}
function normalizePlace(text){
  return String(text||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}
export function parseSvenskalagIcal(text,today){
  if(typeof text!=='string'||text.length>1024*1024||!text.includes('BEGIN:VCALENDAR'))throw Error('Ogiltig kalenderfil');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('Ogiltigt jämförelsedatum');
  const lines=unfold(text).split('\n');
  const items=[];
  let event=null;
  for(const line of lines){
    if(line==='BEGIN:VEVENT'){event={};continue;}
    if(line==='END:VEVENT'){
      if(event){
        const title=decode(event.SUMMARY);
        const lower=title.toLocaleLowerCase('sv-SE');
        const exclude=/hockeyfritids|fotografering|intresseanmälan|intresseanmäl|anmälan|inställt|cancelled|canceled|lagfoto/.test(lower);
        const date=stockholmDate(event.DTSTART||'');
        const training=/(^|[^\p{L}])träning([^\p{L}]|$)|(^|[^\p{L}])is\s*1[789]\s*\/\s*1[789]([^\p{L}]|$)/iu.test(lower);
        const pool=!/^(?:match|träningsmatch)\s*(?::|[-–]|\s+(?:mot|vs\.?|versus)\b)/iu.test(title)
          && /(^|[^\p{L}])poolspel([^\p{L}]|$)/iu.test(lower);
        const opponent=!pool&&!training?calendarOpponent(title):'';
        const startTime=stockholmStartTime(event.DTSTART||'');
        const endTime=stockholmStartTime(event.DTEND||'');
        if(!exclude&&event.STATUS!=='CANCELLED'&&date&&date>=today&&(training||pool||opponent)){
          const place=normalizePlace(decode(event.LOCATION));
          // Never infer a venue from an opponent or from a free-form description.
          const hallText=(place+' '+title).toLocaleLowerCase('sv-SE');
          const hasLilla=/\blilla\s+hallen\b/.test(hallText);
          const hasStora=/\bstora\s+hallen\b/.test(hallText);
          const hall=hasLilla!==hasStora?(hasLilla?'Lilla Hallen':'Stora hallen'):'';
          items.push(pool?{type:'pool',date,place,hall:''}:training?{type:'training',date,hall,startTime,endTime}:{type:'match',date,startTime,opponent,place});
        }
      }
      event=null;continue;
    }
    if(!event)continue;
    const colon=line.indexOf(':');
    if(colon<0)continue;
    const key=line.slice(0,colon).split(';')[0].toUpperCase();
    if(['SUMMARY','DTSTART','DTEND','LOCATION','STATUS'].includes(key)&&event[key]===undefined)event[key]=line.slice(colon+1);
  }
  const unique=new Map();
  for(const item of items){
    const key=item.type+':'+item.date+':'+(item.type==='pool'?normalizePlace(item.place).toLocaleLowerCase('sv-SE'):item.type==='match'?item.startTime+':'+item.opponent.toLocaleLowerCase('sv-SE'):'');
    const older=unique.get(key);
    if(older&&item.type==='training')older.multipleSessions=true;
    else if(!older)unique.set(key,item);
  }
  return [...unique.values()].slice(0,500);
}
