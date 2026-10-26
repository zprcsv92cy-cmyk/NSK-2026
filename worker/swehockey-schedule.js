export const SWEHOCKEY_SCHEDULE_URL='https://stats.swehockey.se/District/Sodermanland/Nykoping/ScheduleAndResults/Schedule/21963';
const hockeyText=value=>String(value||'').replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|nbsp|quot|apos|lt|gt|aring|auml|ouml|Aring|Auml|Ouml);/g,(m,k)=>{if(k[0]==='#'){const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',nbsp:' ',quot:'"',apos:"'",lt:'<',gt:'>',aring:'å',auml:'ä',ouml:'ö',Aring:'Å',Auml:'Ä',Ouml:'Ö'}[k]||m;}).replace(/\s+/g,' ').trim();
const ownHockeyTeam=name=>/^nyköpings\s+(?:sk|sportklubb)(?:\s+(?:röd|svart|vit|gul|blå|grön))?$/iu.test(name);
export function parseSweHockeySchedule(html,today){
 if(typeof html!=='string'||html.length>1500000||!/^\d{4}-\d{2}-\d{2}$/.test(today))throw Error('Ogiltigt schema');
 const table=[...html.matchAll(/<table\b[^>]*class=["'][^"']*\btblContent\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)].map(m=>m[1]).find(t=>/Starttime/i.test(t)&&/Venue\s*\/\s*Host/i.test(hockeyText(t)));
 if(!table)throw Error('Schematabellen kunde inte identifieras');
 let currentDate='',currentGroup='',lastTime='';const groups=new Map();let count=0;
 for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const raw=match[1];if(!/lnkTooltip/.test(raw))continue;
  const cells=[...raw.matchAll(/<td\b[^>]*?\s*\/\s*>|<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>hockeyText(m[1]||''));if(cells.length!==5)throw Error('Schematabellens kolumner har ändrats');
  const date=cells.slice(0,2).find(c=>/^\d{4}-\d{2}-\d{2}$/.test(c))||currentDate;
  if(!date||Number.isNaN(new Date(date+'T12:00:00Z').valueOf())||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Ogiltigt matchdatum');
  const marker=hockeyText(/title=["']([^"']*)["']/i.exec(raw)?.[1]||'').match(/Pool\s*:\s*(\d+)\s*,\s*Game\s*:\s*(\d+)/i);
  if(!marker)throw Error('Poolspelsgrupp saknas');const id='swehockey:21963:'+marker[1]+':'+marker[2],groupKey=id+':'+date;
  if(groupKey!==currentGroup||date!==currentDate){lastTime='';currentGroup=groupKey;}currentDate=date;
  const explicit=cells[2];if(explicit){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(explicit))throw Error('Ogiltig starttid');lastTime=explicit==='00:00'?'':explicit;}
  const sides=cells[3].split(/\s+[-–]\s+/);if(sides.length!==2)throw Error('Matchens lag kunde inte tolkas');
  const venue=cells[4].split(/\s+\/\s+/)[0].trim().replace(/^\/$/,'');
  let group=groups.get(groupKey);if(!group){group={type:'pool',source:'swehockey',sourceUrl:SWEHOCKEY_SCHEDULE_URL,activityId:id,date,place:venue,hall:venue,matches:[]};groups.set(groupKey,group);}if(venue&&!group.place)group.place=group.hall=venue;
  count++;const home=ownHockeyTeam(sides[0]),away=ownHockeyTeam(sides[1]);if(home===away)continue;
  group.matches.push({date,startTime:lastTime,opponent:(home?sides[1]:sides[0]).trim(),ownTeam:home?sides[0]:sides[1],place:group.place,timeInherited:!explicit&&!!lastTime,source:'swehockey',sourceUrl:SWEHOCKEY_SCHEDULE_URL});
 }
 if(!count)throw Error('Schemat innehåller inga matchrader');
 return [...groups.values()].filter(g=>g.matches.length&&g.date>=today).map(g=>({...g,matches:g.matches.map(m=>({...m,place:g.place}))}));
}
const hockeyVenue=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('sv-SE').replace(/\b(?:smehallen\s*b)\b/g,'smehallen').replace(/\s+/g,' ').trim();
export function mergeHockeyCalendar(items,pools){
 const output=items.map(x=>({...x}));
 for(const pool of pools){
  const sameDate=output.filter(x=>x.type==='pool'&&x.date===pool.date);
  const exact=sameDate.filter(x=>hockeyVenue(x.place||x.hall)&&hockeyVenue(x.place||x.hall)===hockeyVenue(pool.place||pool.hall));
  const target=exact.length===1?exact[0]:(!pool.place&&sameDate.length===1?sameDate[0]:null);
  const merged=target||{...pool};if(target&&/inställ|inställd|cancelled|okänd|ej bestämd/iu.test(target.place||'')){merged.notice='SvenskaLag anger '+target.place+'. Kontrollera med arrangören före start.';merged.place=pool.place||'';merged.hall=pool.hall||'';}const oldMatches=output.filter(x=>x.type==='match'&&x.date===pool.date&&hockeyVenue(x.place||x.hall)===hockeyVenue(merged.place||merged.hall));
  const matches=pool.matches.map(m=>{const found=oldMatches.filter(o=>hockeyVenue(o.opponent)===hockeyVenue(m.opponent));return {...m,startTime:m.startTime|| (found.length===1?found[0].startTime||'':''),place:merged.place||pool.place};});
  Object.assign(merged,{matches,source:target?'SvenskaLag + SweHockey':'SweHockey',sourceUrl:SWEHOCKEY_SCHEDULE_URL});
  // Linked fixtures are the complete schedule; suppress duplicate standalone matches at this venue.
  for(let i=output.length-1;i>=0;i--)if(oldMatches.includes(output[i]))output.splice(i,1);
  if(!target)output.push(merged);
 }
 return output;
}
export async function syncSweHockey(env,now=new Date(),fetcher=globalThis.fetch){
 if(env.NSK_ENABLE_SWEHOCKEY_SYNC!=='true')return {skipped:'disabled'};
 if(!env.AUTH_DB)throw Error('Schemalagring saknas');
 const response=await fetcher(SWEHOCKEY_SCHEDULE_URL,{headers:{Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(!response.ok||Number(response.headers.get('content-length')||0)>1500000)throw Error('SweHockey kunde inte hämtas');
 const reader=response.body?.getReader();let html='',size=0;const decoder=new TextDecoder();if(!reader)throw Error('Tomt schemasvar');
 for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1500000){void reader.cancel();throw Error('Schemat är för stort');}html+=decoder.decode(chunk.value,{stream:true});}html+=decoder.decode();
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),pools=parseSweHockeySchedule(html,today);
 // A structurally valid but empty response must not erase the last good schedule.
 if(!pools.length)return {preserved:true,pools:0};
 await env.AUTH_DB.prepare("INSERT INTO swehockey_schedule_cache(team_id,items_json,updated_at) VALUES('NSK Team 18',?,?) ON CONFLICT(team_id) DO UPDATE SET items_json=excluded.items_json,updated_at=excluded.updated_at").bind(JSON.stringify(pools),now.toISOString()).run();return {pools:pools.length,matches:pools.reduce((n,p)=>n+p.matches.length,0)};
}
export function withSweHockey(original){
 return async function(req,env,ctx){
  const url=new URL(req.url),action=url.searchParams.get('action');const response=await original(req,env,ctx);
  if(env.NSK_ENABLE_SWEHOCKEY_SYNC!=='true'||url.pathname!=='/api/training'||!response.ok)return response;
  if(req.method==='POST'&&action==='svenskalag-refresh'){
   const data=await response.clone().json();try{data.swehockey={ok:true,...await syncSweHockey(env)};}catch{data.swehockey={ok:false,error:'SweHockey kunde inte uppdateras. Senast hämtade schema behålls.'};}return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});
  }
  if(req.method==='GET'&&action==='svenskalag-saved'){
   try{const data=await response.clone().json();const cached=await env.AUTH_DB.prepare("SELECT items_json,updated_at FROM swehockey_schedule_cache WHERE team_id='NSK Team 18'").first();if(cached){const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());data.items=mergeHockeyCalendar(data.items||[],JSON.parse(cached.items_json).filter(p=>p.date>=today));data.swehockeyUpdatedAt=cached.updated_at;}return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});}catch{return response;}
  }
  return response;
 };
}
