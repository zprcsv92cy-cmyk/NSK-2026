import {mergeConcurrent} from '../concurrency-merge.mjs';
const staffKey=/^lagpersonal:team:([1-9][0-9]*)$/;
// One request-local adapter covers legacy and coach-linked staff routes alike.
// Reads never migrate data. The first authorized write seeds D1 from its KV base.
export function concurrentStaffStore(db,legacy){
 const bases=new Map();
 const current=async(key)=>{const row=await db.prepare('SELECT rows_json,revision FROM concurrent_staff WHERE team_id=?').bind(staffKey.exec(key)[1]).first();return row?{rows:JSON.parse(row.rows_json),revision:row.revision}:null;};
 const validate=rows=>{if(!Array.isArray(rows)||rows.length>500||rows.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||typeof r.role!=='string')||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Ogiltig lagpersonal');const names=rows.map(r=>r.role+'|'+r.name.trim().toLocaleLowerCase('sv-SE'));if(new Set(names).size!==names.length)throw Object.assign(Error('Personen finns redan eller ändrades samtidigt.'),{status:409});};
 return new Proxy(legacy,{get(target,property){
  if(property==='get')return async(key,type,...rest)=>{if(!staffKey.test(key))return target.get(key,type,...rest);const row=await current(key);const rows=row?row.rows:await target.get(key,'json');if(rows!==null&&!Array.isArray(rows))throw Error('Ogiltig lagpersonal');bases.set(key,structuredClone(rows||[]));return type==='json'?structuredClone(rows):rows===null?null:JSON.stringify(rows);};
  if(property==='put')return async(key,value,...rest)=>{
   if(!staffKey.test(key))return target.put(key,value,...rest);
   if(!bases.has(key))throw Error('Lagpersonal måste läsas före ändring');
   const desired=JSON.parse(value),base=bases.get(key);validate(desired);
   for(let attempt=0;attempt<5;attempt++){
    const saved=await current(key),rows=mergeConcurrent(base,desired,saved?.rows||base);validate(rows);
    const result=saved?await db.prepare('UPDATE concurrent_staff SET rows_json=?,revision=revision+1 WHERE team_id=? AND revision=?').bind(JSON.stringify(rows),staffKey.exec(key)[1],saved.revision).run():await db.prepare('INSERT INTO concurrent_staff(team_id,rows_json,revision) VALUES(?,?,1) ON CONFLICT(team_id) DO NOTHING').bind(staffKey.exec(key)[1],JSON.stringify(rows)).run();
    if(result.meta?.changes){bases.set(key,structuredClone(rows));return;}
   }
   throw Object.assign(Error('Lagpersonal ändras samtidigt. Försök igen.'),{status:409});
  };
  const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
 }});
}
export function withConcurrentStaff(handler){return (request,env,...args)=>handler(request,env.NSK_MULTIUSER_ENABLED==='true'&&env.AUTH_DB&&env.NSK_TRAINERS?{...env,NSK_TRAINERS:concurrentStaffStore(env.AUTH_DB,env.NSK_TRAINERS)}:env,...args);}
