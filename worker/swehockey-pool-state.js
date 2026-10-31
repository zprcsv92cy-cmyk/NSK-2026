export function sweHockeyPoolKey(pool){
 return pool&&typeof pool.activityId==='string'&&pool.activityId.startsWith('swehockey:')&&/^\d{4}-\d{2}-\d{2}$/.test(pool.date||'')?'swehockey-pool:'+pool.activityId+':'+pool.date:null;
}
export async function ensureSweHockeyPoolKeys(db,keys){
 const wanted=keys.filter(k=>k.startsWith('swehockey-pool:'));if(!wanted.length)return true;
 const existing=await db.prepare(`SELECT event_key FROM svenskalag_calendar_events WHERE team_id=? AND event_key IN (${wanted.map(()=>'?').join(',')})`).bind('NSK Team 18',...wanted).all();
 const found=new Set((existing.results||[]).map(r=>r.event_key)),missing=wanted.filter(k=>!found.has(k));if(!missing.length)return true;
 const cache=await db.prepare("SELECT items_json FROM swehockey_schedule_cache WHERE team_id='NSK Team 18'").first();const pools=cache?JSON.parse(cache.items_json):[];
 const snapshots=missing.map(key=>({key,pool:pools.find(p=>sweHockeyPoolKey(p)===key)}));if(snapshots.some(s=>!s.pool))return false;
 await db.batch(snapshots.map(({key,pool})=>db.prepare("INSERT OR IGNORE INTO svenskalag_calendar_events(team_id,event_key,event_type,event_date,event_json,source,manually_edited) VALUES(?,?,'pool',?,?,'manual',1)").bind('NSK Team 18',key,pool.date,JSON.stringify({...pool,key,sourceKeys:[key]}))));return true;
}
export async function sweHockeyPoolsWithState(db,pools,today){
 const rows=await db.prepare("SELECT event_key,event_json FROM svenskalag_calendar_events WHERE team_id=? AND event_key LIKE 'swehockey-pool:%'").bind('NSK Team 18').all();
 const states=new Map((rows.results||[]).map(r=>[r.event_key,JSON.parse(r.event_json)])),seen=new Set(),result=[];
 for(const pool of pools){const key=sweHockeyPoolKey(pool);if(!key)continue;seen.add(key);const state=states.get(key)||{};if(state.calendarPermanent)continue;
  if(pool.date>=today||state.calendarHidden)result.push({...pool,key,sourceKeys:[...new Set([key,...(state.sourceKeys||[])])],calendarHidden:state.calendarHidden===true});
 }
 for(const [key,state] of states)if(!seen.has(key)&&state.calendarHidden&&!state.calendarPermanent)result.push({...state,key,sourceKeys:[...new Set([key,...(state.sourceKeys||[])])]});
 return result;
}
