import {ensureSweHockeyPoolKeys} from './swehockey-pool-state.js';
export async function editCalendarPoolSchedule(db,request){
 const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();if(reader){for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return Response.json({ok:false,error:'Too large'},{status:413});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
 let body;try{body=JSON.parse(raw);}catch{return Response.json({ok:false,error:'Invalid JSON'},{status:400});}
 const keys=body?.keys,matches=body?.matches;
 if(!Number.isSafeInteger(body?.revision)||body.revision<0)return Response.json({ok:false,error:'Schedule revision required'},{status:400});
 if(!Array.isArray(keys)||!keys.length||keys.length>64||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||!k||k.length>500)||!Array.isArray(matches)||!matches.length||matches.length>16||matches.some(m=>!m||typeof m.opponent!=='string'||!m.opponent.trim()||m.opponent.length>150||typeof m.startTime!=='string'||m.startTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(m.startTime)))return Response.json({ok:false,error:'Invalid schedule'},{status:400});
 if(!await ensureSweHockeyPoolKeys(db,keys))return Response.json({ok:false,error:'Calendar pool changed'},{status:409});
 const placeholders=keys.map(()=>'?').join(','),rows=await db.prepare(`SELECT event_type,event_date,event_json FROM svenskalag_calendar_events WHERE team_id=? AND event_key IN (${placeholders})`).bind('NSK Team 18',...keys).all(),items=rows.results||[];
 if(items.length!==keys.length||!items.some(r=>r.event_type==='pool')||items.some(r=>!['pool','match'].includes(r.event_type)||JSON.parse(r.event_json).calendarHidden)||new Set(items.map(r=>r.event_date)).size!==1)return Response.json({ok:false,error:'Calendar pool changed or removed'},{status:409});
 const revision=Math.max(0,...items.filter(r=>r.event_type==='pool').map(r=>Number(JSON.parse(r.event_json).manualScheduleRevision)||0));if(body.revision!==revision)return Response.json({ok:false,error:'Schedule changed by another editor'},{status:409});
 const clean=matches.map(m=>({startTime:m.startTime,opponent:m.opponent.trim(),ownTeam:typeof m.ownTeam==='string'?m.ownTeam.slice(0,100):'',...(Number.isInteger(m.lagNo)?{lagNo:m.lagNo}:{}),...(Number.isInteger(m.matchNo)?{matchNo:m.matchNo}:{})}));
 await db.prepare(`UPDATE svenskalag_calendar_events SET event_json=json_set(event_json,'$.matches',json(?),'$.manualSchedule',json('true'),'$.manualScheduleRevision',?,'$.sourceKeys',json(?),'$.calendarSuppressed',json(CASE WHEN event_type='match' THEN 'true' ELSE 'false' END)),manually_edited=1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND event_key IN (${placeholders})`).bind(JSON.stringify(clean),revision+1,JSON.stringify(keys),'NSK Team 18',...keys).run();
 return Response.json({ok:true,matches:clean,revision:revision+1},{headers:{'cache-control':'no-store'}});
}
