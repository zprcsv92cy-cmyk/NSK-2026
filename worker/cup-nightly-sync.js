import {readCupDirectory,matchesCupAge,cupFees} from './cup-discovery.js';
import {importCuponline} from './cuponline-import.js';
const DAY_ZONE='Europe/Stockholm';
export function cupClock(now=new Date()){return {day:now.toLocaleDateString('sv-SE',{timeZone:DAY_ZONE}),hour:Number(new Intl.DateTimeFormat('en-GB',{timeZone:DAY_ZONE,hour:'2-digit',hourCycle:'h23'}).format(now))};}
export async function readCupSnapshot(db){const row=await db.prepare('SELECT day,directory_json,updated_at,last_error FROM cup_sync_state WHERE id=1').first();return row?{...row,items:JSON.parse(row.directory_json)}:null;}
// One minute tick handles two public cups, keeping external requests bounded.
// The persistent lease prevents overlapping ticks from processing the same queue.
export async function runCupNightlySync(env,{now=new Date(),fetcher=fetch}={}){
 const db=env.AUTH_DB;if(!db)throw Error('Cup database unavailable');
 const {day,hour}=cupClock(now);
 const existing=await db.prepare('SELECT day,cursor,pending_json FROM cup_sync_state WHERE id=1').first();
 if(existing&&((existing.day===day&&existing.cursor>=JSON.parse(existing.pending_json).length)||(existing.day!==day&&(hour<2||hour>=6))))return {skipped:'not-due'};
 const stamp=now.toISOString(),lease=crypto.randomUUID(),until=new Date(now.getTime()+600000).toISOString();
 await db.prepare("INSERT OR IGNORE INTO cup_sync_state(id,day,directory_json,pending_json,cursor,lease_until,lease_token,updated_at,last_error) VALUES(1,'','[]','[]',0,'','','','')").run();
 const lock=await db.prepare("UPDATE cup_sync_state SET lease_token=?,lease_until=? WHERE id=1 AND (lease_until='' OR lease_until<?)").bind(lease,until,stamp).run();if(lock.meta?.changes!==1)return {skipped:'locked'};
 try{
  let state=await db.prepare('SELECT * FROM cup_sync_state WHERE id=1').first();
  const first=!state.day,night=hour>=2&&hour<6;
  if((first||night)&&state.day!==day){
   // A failed source read leaves the last successful directory and plans intact.
   const directory=await readCupDirectory(fetcher),items=directory.items.filter(c=>c.startDate>=day&&Array.from({length:10},(_,i)=>'U'+(i+9)).some(age=>matchesCupAge(c.age,age)));
   const planned=await db.prepare("SELECT DISTINCT cup_id FROM cup_plans WHERE status!='Avslutad' AND COALESCE(NULLIF(json_extract(cup_json,'$.endDate'),''),json_extract(cup_json,'$.startDate'))>=?").bind(day).all();
   const pending=[...new Set([...items.map(c=>c.cupId),...(planned.results||[]).map(c=>c.cup_id)])];
   await db.prepare("UPDATE cup_sync_state SET day=?,directory_json=?,pending_json=?,cursor=0,updated_at=?,last_error='' WHERE id=1 AND lease_token=?").bind(day,JSON.stringify(items),JSON.stringify(pending),stamp,lease).run();
   state={...state,day,directory_json:JSON.stringify(items),pending_json:JSON.stringify(pending),cursor:0,last_error:''};
  }
  const pending=JSON.parse(state.pending_json);if(state.cursor>=pending.length)return {done:true};
  // Complete the initial bootstrap even if the app was first deployed in daytime.
  // Normal daily refreshes start in the nightly window above.
  const ids=pending.slice(state.cursor,state.cursor+2);let failures=0;
  for(const cupId of ids){
   try{
    const cup=await importCuponline('https://cuponline.se/start.aspx?cupid='+cupId,fetcher);
    const previous=await db.prepare('SELECT cup_json FROM cup_source_cache WHERE cup_id=?').bind(cupId).first();
    const teamsOk=!cup.warnings.some(w=>w.startsWith('Lagen'));
    if(!teamsOk&&previous)cup.teams=JSON.parse(previous.cup_json).teams;
    await db.prepare('INSERT INTO cup_source_cache(cup_id,cup_json,updated_at) VALUES(?,?,?) ON CONFLICT(cup_id) DO UPDATE SET cup_json=excluded.cup_json,updated_at=excluded.updated_at').bind(cupId,JSON.stringify(cup),stamp).run();
    if(teamsOk){
     // One atomic update changes only teams, even if a leader edits the plan concurrently.
     const teams=JSON.stringify(cup.teams);
     await db.prepare("UPDATE cup_plans SET cup_json=json_set(cup_json,'$.teams',json(?)),revision=revision+1,updated_at=? WHERE cup_id=? AND status!='Avslutad' AND COALESCE(NULLIF(json_extract(cup_json,'$.endDate'),''),json_extract(cup_json,'$.startDate'))>=? AND json_extract(cup_json,'$.teams')!=json(?)").bind(teams,stamp,cupId,day,teams).run();
    }
   }catch{failures++;}
  }
  await db.prepare('UPDATE cup_sync_state SET cursor=cursor+?,last_error=?,updated_at=? WHERE id=1 AND lease_token=?').bind(ids.length,failures?'Vissa cupuppgifter kunde inte uppdateras. Tidigare uppgifter behålls.':state.last_error||'',stamp,lease).run();
  return {processed:ids.length,failed:failures,done:state.cursor+ids.length>=pending.length};
 }catch(error){await db.prepare('UPDATE cup_sync_state SET last_error=? WHERE id=1 AND lease_token=?').bind('Cuponline kunde inte uppdateras. Tidigare uppgifter behålls.',lease).run();throw error;}
 finally{await db.prepare("UPDATE cup_sync_state SET lease_until='',lease_token='' WHERE id=1 AND lease_token=?").bind(lease).run();}
}

export async function discoverStoredCups(db,age,offset=0,now=new Date()){
 const state=await readCupSnapshot(db),today=cupClock(now).day;
 const all=(state?.items||[]).filter(c=>c.startDate>=today&&matchesCupAge(c.age,age)).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name,'sv'));
 const selected=all.slice(offset,offset+5),rows=selected.length?await db.prepare('SELECT cup_id,cup_json,updated_at FROM cup_source_cache WHERE cup_id IN ('+selected.map(()=>'?').join(',')+')').bind(...selected.map(c=>c.cupId)).all():{results:[]};
 const details=new Map((rows.results||[]).map(row=>[row.cup_id,row]));
 return {age,source:'https://cuponline.se/web/default.aspx?nomobile=true',total:all.length,nextOffset:offset+selected.length<all.length?offset+selected.length:null,fetchedAt:state?.updated_at||'',notice:!state?.day?'Cuplistan förbereds automatiskt. Försök igen om en stund.':('Uppdateras varje natt. Senast hämtad '+state.day+'.'+(state.last_error?' '+state.last_error:'')),items:selected.map(item=>{const row=details.get(item.cupId),cup=row?JSON.parse(row.cup_json):null;return {...item,cup,fees:cup?cupFees(cup.info):[],teamsAvailable:!!cup&&!cup.warnings.some(w=>w.startsWith('Lagen')),detailError:cup?'':'Cupuppgifterna väntar på den automatiska hämtningen.'};})};
}
