import {parseSvenskalagIcal} from './svenskalag-ical.js';
import {syncCalendarCache} from './svenskalag-calendar-cache.js';

// Fail closed until a dedicated production migration and explicit opt-in.
export async function runSvenskalagScheduledSync(env,now=new Date()){
 if(env.NSK_ENABLE_SVENSKALAG_AUTO_SYNC!=='true')return {skipped:'disabled'};
 if(!env.AUTH_DB||env.NSK_SVENSKALAG_TEAM_ID!=='NSK Team 18')
  throw Error('Calendar sync configuration incomplete');
 const response=await fetch('https://cal.svenskalag.se/103684',{
  headers:{Accept:'text/calendar'},redirect:'manual',signal:AbortSignal.timeout(12000)
 });
 if(!response.ok||response.status>=300||Number(response.headers.get('content-length')||0)>1048576)
  throw Error('Calendar feed unavailable');
 const body=await response.text();
 if(body.length>1048576)throw Error('Calendar feed too large');
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const items=parseSvenskalagIcal(body,today);
 // Never infer an empty feed as an instruction to delete existing activities.
 return syncCalendarCache(env.AUTH_DB,env.NSK_SVENSKALAG_TEAM_ID,items);
}
