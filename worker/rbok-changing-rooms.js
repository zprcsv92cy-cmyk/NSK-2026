// Public information board, fixed upstream only. Never accept a caller-supplied URL.
export const RBOK_SOURCE='https://nykoping.rbok.se/informationstavla?id=7a4f6400-3abd-4b6d-ad93-c7158bea2e1f';
const upstream='https://nykoping.rbok.se/Informationstavla/_Item?id=7a4f6400-3abd-4b6d-ad93-c7158bea2e1f&index=0';
const clean=value=>String(value).replace(/<[^>]*>/g,' ').replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const months=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
export function parseChangingRooms(html,today){
 if(typeof html!=='string'||html.length>524288||!html.includes('<tbody>'))throw Error('Invalid board');
 const anchor=new Date(today+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||Number.isNaN(anchor.valueOf()))throw Error('Invalid date');
 const result=[];
 for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),m=>clean(m[1]));
  if(cells.length!==5)continue;
  const [date,time,resource,bookedBy]=cells;
  // A generic NSK booking or J18 is insufficient evidence for Team 18.
  if(!/^Nyköpings Sportklubb NSK\s*18$/iu.test(bookedBy))continue;
  const day=date.match(/^(?:mån|tis|ons|tor|fre|lör|sön)\s+(\d{1,2})\s+([a-zåäö]+)$/iu);
  const span=time.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})$/);
  const location=resource.match(/^Rosvalla\s*\/\s*(Lilla|Stora) ishallen\s*\/\s*Omkl\.\s*(\d{1,2}(?:\s*[A-B])?)$/iu);
  if(!day||!span||!location)continue;
  const month=months.indexOf(day[2].toLocaleLowerCase('sv-SE').slice(0,3));
  if(month<0)continue;
  const dates=[-1,0,1].map(offset=>new Date(Date.UTC(anchor.getUTCFullYear()+offset,month,Number(day[1]),12)))
   .filter(d=>d.getUTCMonth()===month&&d.getUTCDate()===Number(day[1])&&Math.abs(d-anchor)<=14*86400000);
  if(dates.length!==1)continue;
  const minutes=t=>/^\d{2}:\d{2}$/.test(t)&&Number(t.slice(0,2))<24&&Number(t.slice(3))<60?Number(t.slice(0,2))*60+Number(t.slice(3)):NaN;
  if(!(minutes(span[1])<minutes(span[2])))continue;
  result.push({date:dates[0].toISOString().slice(0,10),hall:location[1].toLocaleLowerCase('sv-SE')+' hallen',startTime:span[1],endTime:span[2],room:location[2].replace(/\s+/g,'').toUpperCase()});
 }
 return result;
}
export async function fetchChangingRooms(fetcher=fetch,cache=globalThis.caches?.default,now=new Date()){
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const key=new Request(upstream+'&nsk_cache_date='+today);
 if(cache){const hit=await cache.match(key);if(hit)return hit.json();}
 const response=await fetcher(upstream,{redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Accept:'text/html'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw Error('Board unavailable');
 const reader=response.body.getReader();let size=0,html='';const decoder=new TextDecoder();
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>524288){await reader.cancel();throw Error('Board too large');}html+=decoder.decode(value,{stream:true});}html+=decoder.decode();}finally{reader.releaseLock();}
 const data={ok:true,source:RBOK_SOURCE,checkedAt:now.toISOString(),bookings:parseChangingRooms(html,today)};
 if(cache)await cache.put(key,Response.json(data,{headers:{'cache-control':'public, max-age=120'}}));
 return data;
}
const snapshotKey='rbok:team18:rooms:v1';
export async function readChangingRooms(env,now=new Date()){
 if(env.NSK_ISOLATED_MODE==='true')return {ok:true,bookings:[]};
 const saved=await env.NSK_TRAINERS?.get(snapshotKey,'json');
 if(saved&&now-new Date(saved.checkedAt)>=0&&now-new Date(saved.checkedAt)<26*3600000)return saved;
 return fetchChangingRooms(fetch,globalThis.caches?.default,now);
}
export async function runChangingRoomCheck(env,now=new Date(),fetcher=fetch){
 if(env.NSK_ISOLATED_MODE==='true'||env.NSK_ENABLE_SVENSKALAG_AUTO_SYNC!=='true')return {skipped:'disabled'};
 if(!env.NSK_TRAINERS||!env.AUTH_DB||env.NSK_SVENSKALAG_TEAM_ID!=='NSK Team 18')throw Error('Room configuration incomplete');
 const local=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
 const current=local(now),future=local(new Date(now.valueOf()+2*3600000));
 const daily=current.slice(11,13)==='10'&&Number(current.slice(14,16))<15;
 let due=daily;
 if(!due){
  const rows=await env.AUTH_DB.prepare("SELECT event_json FROM svenskalag_calendar_events WHERE team_id=? AND event_type='training' AND event_date=?").bind('NSK Team 18',future.slice(0,10)).all();
  const minute=value=>/^\d{2}:\d{2}$/.test(value)&&Number(value.slice(0,2))<24&&Number(value.slice(3))<60?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
  due=(rows.results||[]).some(row=>{try{const event=JSON.parse(row.event_json);const difference=minute(event.startTime||event.start_time||'')-minute(future.slice(11,16));return difference>=0&&difference<15;}catch{return false;}});
 }
 if(!due)return {skipped:'not due'};
 const slot=current.slice(0,14)+String(Math.floor(Number(current.slice(14,16))/15));
 const last=await env.NSK_TRAINERS.get(snapshotKey,'json');
 if(last?.slot===slot)return {skipped:'already checked'};
 // Do not overwrite a good snapshot with a failed request; reads expire it after 26h.
 const data={...await fetchChangingRooms(fetcher,null,now),slot};
 await env.NSK_TRAINERS.put(snapshotKey,JSON.stringify(data),{expirationTtl:93600});
 return {checked:true,count:data.bookings.length};
}

export async function refreshChangingRooms(env,now=new Date(),fetcher=fetch){
 if(env.NSK_ISOLATED_MODE==='true')return {ok:true,bookings:[]};
 if(!env.NSK_TRAINERS)throw Error('Room cache unavailable');
 const data=await fetchChangingRooms(fetcher,null,now);
 await env.NSK_TRAINERS.put(snapshotKey,JSON.stringify(data),{expirationTtl:93600});
 return data;
}
