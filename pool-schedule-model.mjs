const slot=r=>Number(r.lag_no)+':'+Number(r.match_no);
const time=r=>String(r.start_time||'').slice(0,5);
export function validateScheduleRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>16)throw Error('Välj mellan 1 och 16 matcher.');
 return rows.map(r=>{const start=String(r.start_time||'').trim(),opponent=String(r.opponent||'').trim();if(start&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(start))throw Error('Ange en giltig matchtid.');if(!opponent||opponent.length>150)throw Error('Ange motståndare för varje match.');return {...r,start_time:start,opponent};});
}
export async function saveSavedSchedule(db,model,rows,count,api){
 rows=validateScheduleRows(rows);count=Number(count);const pool=model.pool;
 if(!Number.isInteger(count)||count<1||count>8||rows.length!==Number(pool.teams)*count)throw Error('Välj 1–8 matcher per lag.');
 const latest=await db.getPool(pool.id);if(!latest||latest.active===false||latest.removed)throw Error('Återöppna eller återställ poolspelet före redigering.');
 if(Number(latest.matches)!==Number(pool.matches)||Number(latest.teams)!==Number(pool.teams))throw Error('Antalet matcher har ändrats av någon annan. Stäng och öppna redigeringen igen.');
 const originals=new Map(model.configs.map(r=>[slot(r),r])),current=new Map((await db.listPoolTeamMatchConfigs(pool.id)).map(r=>[slot(r),r]));
 for(const r of rows){const old=originals.get(slot(r)),now=current.get(slot(r));if((old?.id||null)!==(now?.id||null)||time(old||{})!==time(now||{})||(old?.opponent||'')!==(now?.opponent||''))throw Error('En match har ändrats av någon annan. Stäng och öppna redigeringen igen.');}
 if(count!==Number(pool.matches)){const shifts=await Promise.all(model.configs.map(r=>db.listShiftSchema(pool.id,r.lag_no,r.match_no)));if(shifts.some(rows=>rows.some(r=>r.done)))throw Error('Antalet matcher kan inte ändras efter genomförda byten.');}
 await api.lock(pool);
 const resize=async()=>{const payload={};for(const k of ['title','place','hall','pool_date','teams','players_on_field','periods','period_time','sub_time'])payload[k]=pool[k];await db.updatePool(pool.id,{...payload,matches:count,status:'Aktiv'});pool.matches=count;};
 if(count!==Number(pool.matches))await resize();
 for(const r of rows){const key=slot(r),old=originals.get(key);if(old&&time(old)===r.start_time&&(old.opponent||'')===r.opponent)continue;
  const base=model.bases.get(key)||await db.lineupBase(null,[]),result=await db.saveMatchInfo({pool_id:Number(pool.id),lag_no:Number(r.lag_no),match_no:Number(r.match_no),start_time:r.start_time||null,opponent:r.opponent,plan:old?.plan||'Plan 1',base});
  if(result.base)model.bases.set(key,result.base);const updated={...old,...r,id:result.row?.id||old?.id};originals.set(key,updated);model.configs=[...originals.values()];
 }

 await api.mirror(pool,rows.map(r=>({startTime:r.start_time,opponent:r.opponent,lagNo:r.lag_no,matchNo:r.match_no,ownTeam:'Lag '+r.lag_no})));
}
