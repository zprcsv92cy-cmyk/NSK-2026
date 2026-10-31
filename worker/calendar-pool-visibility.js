import {ensureSweHockeyPoolKeys} from './swehockey-pool-state.js';
// A soft removal in the calendar cache; scheduled sync preserves manually edited rows.
export async function changeCalendarPoolVisibility(db,request){
 const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
 if(reader){for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return Response.json({ok:false,error:'Too large'},{status:413});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
 let body;try{body=JSON.parse(raw);}catch{return Response.json({ok:false,error:'Invalid JSON'},{status:400});}
 const keys=body?.keys,hidden=body?.hidden!==false;
 if(!Array.isArray(keys)||!keys.length||keys.length>64||keys.some(k=>typeof k!=='string'||!k||k.length>500)||new Set(keys).size!==keys.length)return Response.json({ok:false,error:'Invalid calendar keys'},{status:400});
 if(!await ensureSweHockeyPoolKeys(db,keys))return Response.json({ok:false,error:'SweHockey pool changed or missing'},{status:409});
 const permanent=body.permanent===true;
 const placeholders=keys.map(()=>'?').join(',');
 const {results=[]}=await db.prepare(`SELECT event_key,event_type,event_date,event_json FROM svenskalag_calendar_events WHERE team_id=? AND event_key IN (${placeholders})`).bind('NSK Team 18',...keys).all();
 if(results.length!==keys.length||!results.some(r=>r.event_type==='pool')||results.some(r=>!['pool','match'].includes(r.event_type))||new Set(results.map(r=>r.event_date)).size!==1)return Response.json({ok:false,error:'Calendar pool changed or missing'},{status:409});
 if(permanent){
  if(!hidden||results.some(r=>!JSON.parse(r.event_json).calendarHidden))return Response.json({ok:false,error:'Remove pool before permanent deletion'},{status:409});
  await db.prepare(`UPDATE svenskalag_calendar_events SET event_json=json_object('type',event_type,'date',event_date,'calendarHidden',json('true'),'calendarPermanent',json('true')),manually_edited=1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND event_key IN (${placeholders})`).bind('NSK Team 18',...keys).run();
  return Response.json({ok:true,hidden:true,permanent:true},{headers:{'cache-control':'no-store'}});
 }
 await db.prepare(`UPDATE svenskalag_calendar_events SET event_json=json_set(event_json,'$.calendarHidden',json(?),'$.sourceKeys',json(?)),manually_edited=1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND event_key IN (${placeholders}) AND event_type IN ('pool','match')`).bind(hidden?'true':'false',JSON.stringify(keys),'NSK Team 18',...keys).run();
 return Response.json({ok:true,hidden},{headers:{'cache-control':'no-store'}});
}

// Shared presentation state for saved pools. Match data stays in Baserow until final deletion.
export async function savedPoolRemovalState(db,request){
 if(request.method==='GET'){
  const rows=await db.prepare("SELECT event_json FROM svenskalag_calendar_events WHERE team_id=? AND event_key LIKE 'nsk-pool-state:%'").bind('NSK Team 18').all();
  return Response.json({ok:true,states:(rows.results||[]).map(r=>JSON.parse(r.event_json))},{headers:{'cache-control':'no-store'}});
 }
 const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();if(reader){for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>2048){await reader.cancel();return Response.json({ok:false,error:'Too large'},{status:413});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
 let body;try{body=JSON.parse(raw);}catch{return Response.json({ok:false,error:'Invalid JSON'},{status:400});}
 if(!Number.isSafeInteger(body.poolId)||body.poolId<1||!/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')||typeof body.removed!=='boolean'||(body.permanent!==undefined&&typeof body.permanent!=='boolean'))return Response.json({ok:false,error:'Invalid pool state'},{status:400});
 const key='nsk-pool-state:'+body.poolId,existing=await db.prepare('SELECT event_json FROM svenskalag_calendar_events WHERE team_id=? AND event_key=?').bind('NSK Team 18',key).first();
 const previous=existing?JSON.parse(existing.event_json):{};
 if(previous.permanent||body.permanent&&!previous.removed)return Response.json({ok:false,error:'Pool state changed'},{status:409});
 const state={...previous,type:'pool-state',poolId:body.poolId,removed:body.removed,permanent:body.permanent===true,...(typeof body.scheduleEdited==='boolean'?{scheduleEdited:body.scheduleEdited}:{})};
 await db.prepare("INSERT INTO svenskalag_calendar_events(team_id,event_key,event_type,event_date,event_json,source,manually_edited) VALUES(?,?,'pool',?,?,'manual',1) ON CONFLICT(team_id,event_key) DO UPDATE SET event_json=excluded.event_json,manually_edited=1,updated_at=CURRENT_TIMESTAMP").bind('NSK Team 18',key,body.date,JSON.stringify(state)).run();
 return Response.json({ok:true,state},{headers:{'cache-control':'no-store'}});
}
