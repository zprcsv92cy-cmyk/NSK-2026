// Pure, side-effect-free reconciliation for SvenskaLag calendar entries.
// No database writes, no deletion of missing entries, and no attendance data.
const TYPES=new Set(['training','pool','match']);
const clean=s=>String(s||'').normalize('NFKC').trim();
export function calendarEventKey(item){
  if(!item||!TYPES.has(item.type)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date||''))return null;
  if(item.type==='match'){
    if(!/^\d{2}:\d{2}$/.test(item.startTime||'')||!clean(item.opponent))return null;
    return 'match:'+item.date+':'+item.startTime+':'+clean(item.opponent).toLocaleLowerCase('sv-SE');
  }
  if(item.type==='pool')return 'pool:'+item.date+':'+clean(item.place).toLocaleLowerCase('sv-SE');
  return 'training:'+item.date;
}
/**
 * existing entries: {key, source:'svenskalag'|'manual', manuallyEdited:boolean, ...}
 * Only calendar-owned, unedited entries are candidates for update.
 * The caller must independently enforce team authorization and transactions.
 */
export function planCalendarReconciliation(incoming,existing){
  if(!Array.isArray(incoming)||!Array.isArray(existing))throw new TypeError('Expected arrays');
  const byKey=new Map(existing.map(row=>[row.key,row]));
  const seen=new Set(),create=[],update=[],preserve=[];
  for(const item of incoming){
    const key=calendarEventKey(item);
    if(!key||seen.has(key))continue;
    seen.add(key);
    const previous=byKey.get(key);
    if(!previous){create.push({key,item});continue;}
    if(previous.source!=='svenskalag'||(previous.manuallyEdited===true||previous.manuallyEdited===1)){
      preserve.push({key,reason:'manual'});continue;
    }
    update.push({key,item});
  }
  // Never remove an event merely because it vanished from the feed.
  return {create,update,preserve,delete:[]};
}
