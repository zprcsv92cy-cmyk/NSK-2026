// Isolated durable object for personally authorized multi-team shift saves.
// Does not import or alter the legacy ShiftLock storage semantics.
const TABLES={lag:1255083,poolspel:1255101,spelare:1255098,bytesschema:1255115};
const respond=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
const fail=(status,error)=>respond(status,{ok:false,error});
const positive=x=>Number.isSafeInteger(x)&&x>0;
const links=v=>Array.isArray(v)?v.map(x=>Number(x&&typeof x==='object'?x.id:x)):[];
const base=table=>'https://api.baserow.io/api/database/rows/table/'+TABLES[table]+'/';
const auth=env=>({Authorization:'Token '+env.BASEROW_TOKEN});
async function one(env,table,id){
  const result=await fetch(base(table)+id+'/?user_field_names=true',{headers:auth(env)});
  if(result.status===404)return null;
  if(!result.ok)throw Error('Baserow read unavailable');
  return result.json();
}
async function all(env,table){
  const rows=[];
  for(let page=1;page<=100;page++){
    const result=await fetch(base(table)+'?user_field_names=true&size=200&page='+page,{headers:auth(env)});
    if(!result.ok)throw Error('Baserow list unavailable');
    const value=await result.json();
    if(!Array.isArray(value?.results))throw Error('Invalid Baserow list');
    rows.push(...value.results);
    if(!value.next)return rows;
  }
  throw Error('Baserow page limit');
}
function validShift(s){
  return s&&positive(s.period_no)&&typeof s.time_left==='string'&&
    /^\d{2,3}:\d{2}$/.test(s.time_left)&&Array.isArray(s.players)&&
    s.players.length<=25&&s.players.every(positive)&&
    new Set(s.players).size===s.players.length;
}
function same(old,s){
  return old&&Number(old.Periodnummer)===s.period_no&&
    old['Tid kvar']===s.time_left&&
    JSON.stringify(links(old['Spelare på plan']).sort((a,b)=>a-b))===
    JSON.stringify([...s.players].sort((a,b)=>a-b));
}
export class PersonalShiftSaveLock {
  constructor(ctx,env){this.env=env;this.queue=Promise.resolve();}
  async fetch(req){
    if(req.method!=='POST')return fail(405,'Otillåten metod');
    const work=()=>this.save(req);
    const result=this.queue.then(work);
    this.queue=result.then(()=>undefined,()=>undefined);
    return result;
  }
  async save(req){
    if(!this.env?.BASEROW_TOKEN)return fail(503,'Databas saknas');
    let body;
    try{body=await req.json();}catch{return fail(400,'Ogiltig JSON');}
    if(!body||typeof body!=='object'||Array.isArray(body)||
      Object.keys(body).some(k=>!['team_id','pool_id','lag_no','match_no','shifts'].includes(k))||
      ![body.team_id,body.pool_id,body.lag_no,body.match_no].every(positive)||
      !Array.isArray(body.shifts)||body.shifts.length>200||
      body.shifts.some(s=>!validShift(s)))
      return fail(400,'Ogiltigt bytesschema');
    const {team_id:teamId,pool_id:poolId,lag_no:lagNo,match_no:matchNo,shifts}=body;
    try{
      const pool=await one(this.env,'poolspel',poolId);
      if(!pool||!links(pool.Lag).includes(teamId))
        return fail(403,'Poolspelet tillhör ett annat lag');
      if(lagNo>Number(pool['Antal lag'])||matchNo>Number(pool['Antal matcher'])||
        shifts.some(s=>s.period_no>Number(pool.Perioder)))
        return fail(400,'Match eller period utanför poolspelet');
      const teamRows=await all(this.env,'lag');
      if(teamRows.filter(t=>Number(t.id)===teamId).length!==1)
        return fail(403,'Laget kunde inte verifieras');
      const validPlayers=new Set((await all(this.env,'spelare')).filter(p=>
        links(p.Lag).includes(teamId)).map(p=>Number(p.id)));
      if(shifts.some(s=>s.players.some(id=>!validPlayers.has(id))))
        return fail(403,'Spelare tillhör ett annat lag');
      const old=(await all(this.env,'bytesschema')).filter(x=>
        links(x.Poolspel).includes(poolId)&&
        Number(x.Lagnummer)===lagNo&&Number(x.Matchnummer)===matchNo);
      if(old.length>shifts.length)return fail(409,'Automatisk borttagning av byten är spärrad');
      const byNo=new Map();
      for(const row of old){
        const n=Number(row.Bytenummer);
        if(!positive(n)||n>shifts.length||byNo.has(n))
          return fail(409,'Dubbletter eller ogiltiga sparade byten');
        byNo.set(n,row);
      }
      if(old.some(row=>row['Genomfört']===true)&&
        (old.length!==shifts.length||
          shifts.some((s,i)=>!same(byNo.get(i+1),s))))
        return fail(409,'Genomförda byten kan inte skrivas över');
      for(let i=0;i<shifts.length;i++){
        const s=shifts[i],current=byNo.get(i+1);
        if(same(current,s))continue;
        const payload={Poolspel:[poolId],Lagnummer:lagNo,Matchnummer:matchNo,
          Bytenummer:i+1,Periodnummer:s.period_no,'Tid kvar':s.time_left,
          'Spelare på plan':s.players};
        if(!current)payload['Genomfört']=false;
        const endpoint=base('bytesschema')+(current?current.id+'/':'')+'?user_field_names=true';
        const r=await fetch(endpoint,{method:current?'PATCH':'POST',
          headers:{...auth(this.env),'Content-Type':'application/json'},
          body:JSON.stringify(payload)});
        if(!r.ok)return fail(502,'Sparningen avbröts; befintliga byten har inte raderats');
        return respond(200,{ok:true,cleanup_pending:true,progress:i+1,expected:shifts.length});
      }
      return respond(200,{ok:true,count:old.length,verified:true,cleanup_pending:false});
    }catch{return fail(503,'Bytesschemat kunde inte kontrolleras');}
  }
}
