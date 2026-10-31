import {changeCalendarPoolVisibility} from './calendar-pool-visibility.js';
import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {validateTrainingPayload} from './training-session-validation.js';
import {authorizeTeamFeature} from './team-authorization-policy.js';
import {parseSvenskalagIcal} from './svenskalag-ical.js';
import {runSvenskalagScheduledSync} from './svenskalag-scheduled-sync.js';
import {readChangingRooms,refreshChangingRooms} from './rbok-changing-rooms.js';

const fail=(status,error)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
export function createTrainingHandler(env,listTeams){
 return async request=>{
  const url=new URL(request.url);
  if(url.pathname!=='/api/training')return fail(404,'Unknown route');
  if(!['GET','PUT','POST','DELETE'].includes(request.method))return fail(405,'Method not allowed');
  const team=url.searchParams.getAll('team_id');
  const dates=url.searchParams.getAll('date');
  if(team.length!==1||! /^[1-9][0-9]*$/.test(team[0])||dates.length>1||
    (dates.length===1&&!/^\d{4}-\d{2}-\d{2}$/.test(dates[0]))||
    (['PUT','DELETE'].includes(request.method)&&dates.length!==1)||(request.method==='POST'&&dates.length!==0))return fail(400,'Invalid team or date');
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return fail(401,'Login required');
  if(!env.AUTH_DB||typeof listTeams!=='function')return fail(503,'Unavailable');
  try{
   const actor=await createPersonalRosterIdentityVerifier(env)(token);
   if(!actor)return fail(401,'Invalid session');
   const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   if(!access.memberships.some(m=>m.team_id===team[0])||!access.permissions.includes('read'))return fail(403,'No team access');
   const db=env.AUTH_DB;
   if(request.method==='GET'&&url.searchParams.get('action')==='changing-rooms'){
    if(dates.length)return fail(400,'Board is team-scoped');
    if(!(await listTeams()).some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026'))return fail(403,'Wrong team');
    try{return Response.json(await readChangingRooms(env),{headers:{'cache-control':'private, no-store'}});}
    catch{return fail(502,'Omklädningsrummen kunde inte kontrolleras');}
   }
   if(request.method==='POST'&&url.searchParams.get('action')==='svenskalag-refresh'){
    if(dates.length)return fail(400,'Calendar is team-scoped');
    if(!authorizeTeamFeature(access,team[0],'lineup').allowed)return fail(403,'Edit permission required');
    const trusted=await listTeams();
    if(!trusted.some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026'))return fail(403,'Wrong team');
    if(request.headers.get('content-length')&&Number(request.headers.get('content-length'))>0)return fail(400,'No body allowed');
    try{
     const result=await runSvenskalagScheduledSync(env);
     let changingRooms;
     try{const rooms=await refreshChangingRooms(env);changingRooms={ok:true,count:rooms.bookings.length};}
     catch{changingRooms={ok:false,error:'Kalendern är uppdaterad men omklädningsrummen kunde inte hämtas. Försök igen.'};}
     return Response.json({ok:true,...result,changingRooms},{headers:{'cache-control':'no-store'}});
    }catch{
     return fail(502,'SvenskaLag-hämtningen misslyckades');
    }
   }
   if(request.method==='POST'&&url.searchParams.get('action')==='calendar-pool-visibility'){
    if(!authorizeTeamFeature(access,team[0],'pool').allowed)return fail(403,'Pool edit permission required');
    if(!(await listTeams()).some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026'))return fail(403,'Wrong team');
    return changeCalendarPoolVisibility(db,request);
   }
   if(request.method==='GET'&&url.searchParams.get('action')==='svenskalag-saved'){
    if(dates.length)return fail(400,'Calendar is team-scoped');
    const trusted=await listTeams();
    if(!trusted.some(t=>String(t.id)===team[0]&&t.Namn==='NSK Team 18'&&String(t['Säsong'])==='2026'))return fail(403,'Wrong team');
    const result=await db.prepare("SELECT event_key,event_type,event_date,event_json FROM svenskalag_calendar_events WHERE team_id=? AND (event_date>=? OR (event_type='training' AND ?=1)) ORDER BY event_date DESC,event_key LIMIT 500")
      .bind('NSK Team 18',new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),url.searchParams.get('training_history')==='1'?1:0).all();
    return Response.json({ok:true,items:(result.results||[]).map(r=>({key:r.event_key,type:r.event_type,date:r.event_date,...JSON.parse(r.event_json)})).filter(item=>!item.calendarHidden)},{headers:{'cache-control':'private, no-store'}});
   }
   if(request.method==='GET'&&url.searchParams.get('action')==='svenskalag-calendar'){
    if(dates.length)return fail(400,'Calendar feed is team-scoped, not date-scoped');
    // Categorize failures without exposing upstream bodies or credentials.
    let upstream;
    try{
      upstream=await fetch('https://cal.svenskalag.se/103684',{
        headers:{Accept:'text/calendar'},redirect:'manual',signal:AbortSignal.timeout(12000)
      });
    }catch(error){
      const category=error?.name==='TimeoutError'||error?.name==='AbortError'?'timeout':'network';
      return Response.json({ok:false,error:'Kalenderanslutningen misslyckades',category},{status:502,headers:{'cache-control':'no-store'}});
    }
    if(upstream.status>=300&&upstream.status<400)
      return Response.json({ok:false,error:'Kalenderadressen omdirigerar',category:'redirect'},{status:502,headers:{'cache-control':'no-store'}});
    if(!upstream.ok)
      return Response.json({ok:false,error:'Kalendern svarade med HTTP-fel',category:'upstream_http',upstreamStatus:upstream.status},{status:502,headers:{'cache-control':'no-store'}});
    if(Number(upstream.headers.get('content-length')||0)>1024*1024)
      return Response.json({ok:false,error:'Kalenderfilen är för stor',category:'size'},{status:502,headers:{'cache-control':'no-store'}});
    let ical;
    try{ical=await upstream.text();}catch{
      return Response.json({ok:false,error:'Kalenderfilen kunde inte läsas',category:'body'},{status:502,headers:{'cache-control':'no-store'}});
    }
    if(ical.length>1024*1024)
      return Response.json({ok:false,error:'Kalenderfilen är för stor',category:'size'},{status:502,headers:{'cache-control':'no-store'}});
    try{
      const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const items=parseSvenskalagIcal(ical,today);
      return Response.json({ok:true,source:'SvenskaLag',items},{headers:{'cache-control':'private, no-store'}});
    }catch{
      return Response.json({ok:false,error:'Kalenderformatet kunde inte tolkas',category:'parse'},{status:502,headers:{'cache-control':'no-store'}});
    }
   }
   if(request.method==='GET'){
    if(!dates.length){
     const result=await db.prepare('SELECT training_date, selected_players_json, selected_coaches_json, hall FROM training_sessions WHERE team_id=? ORDER BY training_date DESC LIMIT 500').bind(team[0]).all();
     return Response.json({ok:true,sessions:(result.results||[]).map(r=>({date:r.training_date,players:JSON.parse(r.selected_players_json).length,coaches:JSON.parse(r.selected_coaches_json).filter(id=>!String(id).startsWith('equipment:')).length,equipment:JSON.parse(r.selected_coaches_json).filter(id=>String(id).startsWith('equipment:')).length,hall:r.hall||''}))});
    }
    const row=await db.prepare('SELECT * FROM training_sessions WHERE team_id=? AND training_date=?').bind(team[0],dates[0]).first();
    return Response.json({ok:true,session:row?{selected:JSON.parse(row.selected_players_json),selectedCoaches:JSON.parse(row.selected_coaches_json),goalies:JSON.parse(row.goalies_json),goalieCount:row.goalie_count,hall:row.hall||'',shirtColorCount:row.shirt_color_count||3,allocation:JSON.parse(row.allocation_json),revision:row.revision}:null});
   }
   if(!authorizeTeamFeature(access,team[0],'lineup').allowed)return fail(403,'Edit permission required');
   if(request.method==='DELETE'){
    // Destructive actions require an explicit expected revision. A stale
    // browser tab cannot delete a training edited by another coach.
    const versions=url.searchParams.getAll('revision');
    if(versions.length!==1||!/^[1-9][0-9]*$/.test(versions[0]))return fail(400,'Revision required');
    const deleted=await db.prepare('DELETE FROM training_sessions WHERE team_id=? AND training_date=? AND revision=?')
      .bind(team[0],dates[0],Number(versions[0])).run();
    if(!deleted.meta?.changes)return fail(409,'Training changed or missing');
    await db.prepare('DELETE FROM training_calendar_imports WHERE team_id=? AND training_date=?')
      .bind(team[0],dates[0]).run();
    return Response.json({ok:true,deleted:true});
   }
   if(request.method==='POST'){
    // Only imported, untouched future sessions in the explicitly selected month may be pruned.
    if(url.searchParams.get('action')!=='sync-calendar')return fail(400,'Unknown action');
    const rawSync=await request.text();if(rawSync.length>4096)return fail(413,'Too large');
    let body;try{body=JSON.parse(rawSync)}catch{return fail(400,'Invalid JSON')}
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(body?.month||'')||
       !Array.isArray(body.dates)||body.dates.length===0||body.dates.length>31||
       body.dates.some(d=>typeof d!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(d)||!d.startsWith(body.month+'-'))||
       new Set(body.dates).size!==body.dates.length)return fail(400,'Invalid calendar month');
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const rows=await db.prepare("SELECT training_date FROM training_calendar_imports WHERE team_id=? AND training_date LIKE ?").bind(team[0],body.month+'-%').all();
    const keep=new Set(body.dates);
    let removed=0;
    for(const row of rows.results||[]){
      if(row.training_date<=today||keep.has(row.training_date))continue;
      const deleted=await db.prepare("DELETE FROM training_sessions WHERE team_id=? AND training_date=? AND revision=1 AND selected_players_json='[]' AND selected_coaches_json='[]' AND allocation_json='[]' AND EXISTS (SELECT 1 FROM training_calendar_imports WHERE team_id=? AND training_date=?)")
        .bind(team[0],row.training_date,team[0],row.training_date).run();
      if(deleted.meta?.changes){
        await db.prepare('DELETE FROM training_calendar_imports WHERE team_id=? AND training_date=?').bind(team[0],row.training_date).run();
        removed++;
      }
    }
    return Response.json({ok:true,removed});
   }
   const raw=await request.text();
   if(raw.length>16000)return fail(413,'Too large');
   let data;try{data=JSON.parse(raw)}catch{return fail(400,'Invalid JSON')}
   if(!validateTrainingPayload(data))return fail(400,'Invalid training');
   const values=[JSON.stringify(data.selected),JSON.stringify(data.selectedCoaches),JSON.stringify(data.goalies),data.goalieCount,JSON.stringify(data.allocation),String(actor.user.id),data.hall||'',data.shirtColorCount||3];
   let result;
   if(data.revision===0){
    result=await db.prepare('INSERT INTO training_sessions (team_id,training_date,selected_players_json,selected_coaches_json,goalies_json,goalie_count,allocation_json,revision,updated_by,hall,shirt_color_count) VALUES (?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(team_id,training_date) DO NOTHING')
      .bind(team[0],dates[0],...values).run();
   }else{
    result=await db.prepare('UPDATE training_sessions SET selected_players_json=?,selected_coaches_json=?,goalies_json=?,goalie_count=?,allocation_json=?,updated_by=?,hall=?,shirt_color_count=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND training_date=? AND revision=?')
      .bind(...values,team[0],dates[0],data.revision).run();
   }
   if(!result.meta?.changes)return fail(409,'Concurrent update');
   if(data.revision===0&&data.calendarImport===true){
    await db.prepare('INSERT OR IGNORE INTO training_calendar_imports (team_id,training_date) VALUES (?,?)').bind(team[0],dates[0]).run();
   }
   return Response.json({ok:true,revision:data.revision+1});
  }catch{return fail(503,'Training storage unavailable')}
 };
}
