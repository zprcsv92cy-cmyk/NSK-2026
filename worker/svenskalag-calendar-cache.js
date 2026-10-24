import {planCalendarReconciliation} from './svenskalag-calendar-reconcile.js';

// Call only after the dedicated migration has been applied. The cache is
// intentionally separate from manually maintained training and pool data.
export async function syncCalendarCache(db,teamId,items){
 if(!db||typeof db.prepare!=='function'||!/^\d+$/.test(String(teamId))||Number(teamId)<=0)
  throw new TypeError('Invalid team or database');
 if(!Array.isArray(items)||items.length>500)throw new TypeError('Invalid feed');
 const existing=await db.prepare('SELECT event_key AS key, source, manually_edited AS manuallyEdited FROM svenskalag_calendar_events WHERE team_id=?').bind(String(teamId)).all();
 const plan=planCalendarReconciliation(items,existing.results||[]);
 let created=0,updated=0;
 for(const {key,item} of plan.create){
  const result=await db.prepare("INSERT INTO svenskalag_calendar_events (team_id,event_key,event_type,event_date,event_json) VALUES (?,?,?,?,?) ON CONFLICT(team_id,event_key) DO NOTHING")
   .bind(String(teamId),key,item.type,item.date,JSON.stringify(item)).run();
  created+=result.meta?.changes||0;
 }
 for(const {key,item} of plan.update){
  const result=await db.prepare("UPDATE svenskalag_calendar_events SET event_json=?,event_date=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND event_key=? AND source='svenskalag' AND manually_edited=0")
   .bind(JSON.stringify(item),item.date,String(teamId),key).run();
  updated+=result.meta?.changes||0;
 }
 return {created,updated,preserved:plan.preserve.length,deleted:0};
}
