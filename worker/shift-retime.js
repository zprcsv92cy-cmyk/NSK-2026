// Runs inside the existing per-match ShiftLock queue, shared with save and done.
export function installShiftRetime(ShiftLock,{resolveTables,resolveOwner,fetcher}){
 const save=ShiftLock.prototype.save,done=ShiftLock.prototype.done;
 ShiftLock.prototype.done=async function(body){if(await this.storage?.get('retimePlan'))return Response.json({ok:false,error:'Bytestiden uppdateras. Försök igen när schemat är klart.'},{status:409});return done.call(this,body);};
 ShiftLock.prototype.save=async function(body){
  if(body?.retime!==true){if(await this.storage?.get('retimePlan'))return Response.json({ok:false,error:'Slutför uppdateringen av bytestiden först.'},{status:409});return save.call(this,body);}
  const reply=(status,error,extra={})=>Response.json({ok:status<400,...(error?{error}:{}),...extra},{status});
  try{
   const {pool_id:poolId,lag_no:lagNo,match_no:matchNo}=body;
   if(![poolId,lagNo,matchNo].every(n=>Number.isSafeInteger(n)&&n>0))return reply(400,'Ogiltig match');
   const tables=resolveTables(this.env),base='https://api.baserow.io/api/database/rows/table/',headers={Authorization:'Token '+this.env.BASEROW_TOKEN,'Content-Type':'application/json'};
   const read=async(table,id)=>{const r=await fetcher(base+tables[table]+'/'+id+'/?user_field_names=true',{headers});if(!r.ok)throw Error('Kunde inte läsa matchen');return r.json();};
   const pool=await read('poolspel',poolId),owner=await resolveOwner(this.env)({poolId,lagNo});
   const links=v=>Array.isArray(v)?v.map(x=>Number(typeof x==='object'?x.id:x)):[];
   if(!links(pool.Lag).includes(Number(owner.baserowTeamRowId)))return reply(403,'Fel lag');
   if(pool.Aktiv===false||String(pool.Status?.value||pool.Status)==='Avslutat')return reply(409,'Återöppna poolspelet före ändring.');
   if(lagNo>Number(pool['Antal lag'])||matchNo>Number(pool['Antal matcher']))return reply(400,'Matchen saknas i poolspelet');
   let job=await this.storage.get('retimePlan');
   if(job&&(job.poolId!==poolId||job.lagNo!==lagNo||job.matchNo!==matchNo))return reply(409,'Fel matchlås');
   if(!job){
    const old=[];for(let page=1;page<=100;page++){const r=await fetcher(base+tables.bytesschema+'/?user_field_names=true&size=200&page='+page,{headers});if(!r.ok)throw Error('Kunde inte läsa bytesschemat');const d=await r.json();if(!Array.isArray(d.results))throw Error('Ogiltigt bytesschema');old.push(...d.results.filter(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===lagNo&&Number(r.Matchnummer)===matchNo));if(!d.next)break;if(page===100)throw Error('För stort bytesschema');}
    if(!old.length)return reply(200,null,{empty:true});
    old.sort((a,b)=>Number(a.Bytenummer)-Number(b.Bytenummer));
    if(old.length>200||old.some((r,i)=>Number(r.Bytenummer)!==i+1||links(r.Poolspel).length!==1))return reply(409,'Dubbla eller ogiltiga byten. Inget ändrades.');
    const shifts=planRetimedShifts(old,pool),operations=[];
    for(let i=0;i<shifts.length;i++){
     const current=old[i],s=shifts[i];if(s.keep)continue;
     const desired={Poolspel:[poolId],Lagnummer:lagNo,Matchnummer:matchNo,Bytenummer:i+1,Periodnummer:s.period_no,'Tid kvar':s.time_left,'Spelare på plan':s.players};
     if(!current)desired.Genomfört=false;
     if(current&&Number(current.Periodnummer)===s.period_no&&current['Tid kvar']===s.time_left&&JSON.stringify(links(current['Spelare på plan']))===JSON.stringify(s.players))continue;
     operations.push({method:current?'PATCH':'POST',id:current?.id,payload:desired});
    }
    for(const current of old.slice(shifts.length)){if(current.Genomfört===true)throw Error('Ett genomfört byte får inte tas bort');operations.push({method:'DELETE',id:current.id});}
    job={poolId,lagNo,matchNo,operations,step:0};await this.storage.put('retimePlan',job);
   }
   // Bounded batches let mobile clients report progress and safely resume.
   const end=Math.min(job.step+5,job.operations.length);
   for(;job.step<end;){const op=job.operations[job.step];if(op.method==='POST'){
      // Recover a create whose response or storage checkpoint was lost.
      const found=[];for(let page=1;page<=100;page++){const response=await fetcher(base+tables.bytesschema+'/?user_field_names=true&size=200&page='+page,{headers});if(!response.ok)throw Error('Kunde inte kontrollera det nya bytet');const d=await response.json();found.push(...d.results.filter(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===lagNo&&Number(r.Matchnummer)===matchNo&&Number(r.Bytenummer)===op.payload.Bytenummer));if(!d.next)break;if(page===100)throw Error('För stort bytesschema');}
      if(found.length>1)throw Error('Dubbla byten upptäcktes');
      if(found.length){const r=found[0];if(links(r.Poolspel).length!==1||Number(r.Periodnummer)!==op.payload.Periodnummer||r['Tid kvar']!==op.payload['Tid kvar']||JSON.stringify(links(r['Spelare på plan']))!==JSON.stringify(op.payload['Spelare på plan']))throw Error('Bytet ändrades på annan enhet');job.step++;await this.storage.put('retimePlan',job);continue;}
    }
    const r=await fetcher(base+tables.bytesschema+'/'+(op.id?op.id+'/':'')+'?user_field_names=true',{method:op.method,headers,...(op.payload?{body:JSON.stringify(op.payload)}:{})});if(!r.ok&&!(op.method==='DELETE'&&r.status===404))throw Error('Uppdateringen avbröts. Tryck Spara igen för att fortsätta.');job.step++;await this.storage.put('retimePlan',job);}
   if(job.step<job.operations.length)return reply(200,null,{pending:true});await this.storage.delete('retimePlan');return reply(200,null,{updated:true});
  }catch(e){return reply(503,e.message||'Bytestiden kunde inte uppdateras');}
 };
}

export function planRetimedShifts(old,pool){
 const seconds=Number(pool.Periodtid)*60,interval=Number(pool.Bytestid),periods=Number(pool.Perioder);
 if(![seconds,interval,periods].every(n=>Number.isSafeInteger(n)&&n>0)||periods>10||interval>3600)throw Error('Ogiltig bytestid eller periodtid');
 const ids=v=>Array.isArray(v)?v.map(x=>Number(typeof x==='object'?x.id:x)):[];
 const lastDone=old.reduce((last,r,i)=>r.Genomfört===true?i:last,-1),result=[];
 for(let p=1;p<=periods;p++)for(let left=seconds;left>0;left-=interval){const index=result.length;result.push({period_no:p,time_left:String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0'),players:ids(old[index%old.length]['Spelare på plan'])});if(result.length>200)throw Error('Bytestiden ger fler än 200 byten. Välj längre bytestid.');}
 // Keep completed rows even if a longer interval produces fewer future slots.
 // 00:00 records completed shifts beyond the recalculated playing time.
 for(let index=result.length;index<=lastDone;index++)result.push({period_no:periods,time_left:'00:00',players:ids(old[index]['Spelare på plan'])});
 return result;
}
