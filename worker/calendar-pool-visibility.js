// A soft removal in the calendar cache; scheduled sync preserves manually edited rows.
export async function changeCalendarPoolVisibility(db,request){
 const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
 if(reader){for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return Response.json({ok:false,error:'Too large'},{status:413});}raw+=decoder.decode(value,{stream:true});}raw+=decoder.decode();}
 let body;try{body=JSON.parse(raw);}catch{return Response.json({ok:false,error:'Invalid JSON'},{status:400});}
 const keys=body?.keys,hidden=body?.hidden!==false;
 if(!Array.isArray(keys)||!keys.length||keys.length>64||keys.some(k=>typeof k!=='string'||!k||k.length>500)||new Set(keys).size!==keys.length)return Response.json({ok:false,error:'Invalid calendar keys'},{status:400});
 const placeholders=keys.map(()=>'?').join(',');
 const {results=[]}=await db.prepare(`SELECT event_key,event_type,event_date FROM svenskalag_calendar_events WHERE team_id=? AND event_key IN (${placeholders})`).bind('NSK Team 18',...keys).all();
 if(results.length!==keys.length||!results.some(r=>r.event_type==='pool')||results.some(r=>!['pool','match'].includes(r.event_type))||new Set(results.map(r=>r.event_date)).size!==1)return Response.json({ok:false,error:'Calendar pool changed or missing'},{status:409});
 await db.prepare(`UPDATE svenskalag_calendar_events SET event_json=json_set(event_json,'$.calendarHidden',json(?)),manually_edited=1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND event_key IN (${placeholders}) AND event_type IN ('pool','match')`).bind(hidden?'true':'false','NSK Team 18',...keys).run();
 return Response.json({ok:true,hidden},{headers:{'cache-control':'no-store'}});
}
