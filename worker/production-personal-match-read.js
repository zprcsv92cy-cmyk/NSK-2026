// Read-only match data with server-verified pool/team ownership.
// Untrusted row IDs or pool_id alone never authorize access.
import { handlePersonalTeamList } from './production-personal-teams.js';

const TABLES=Object.freeze({matchkonfiguration:1255157,laguppstallningar:1255113,bytesschema:1255115,poolspel:1255101});
const respond=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const validId=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
const links=(row,key)=>Array.isArray(row?.[key])?row[key].map(v=>String(v&&typeof v==='object'?v.id:v)):[];
async function all(env,table){
  const results=[];
  for(let page=1;page<=100;page++){
    const url='https://api.baserow.io/api/database/rows/table/'+TABLES[table]+'/?user_field_names=true&size=200&page='+page;
    const response=await fetch(url,{headers:{Authorization:'Token '+env.BASEROW_TOKEN},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Baserow unavailable');
    const data=await response.json();
    if(!Array.isArray(data?.results))throw Error('Invalid upstream response');
    results.push(...data.results);
    if(!data.next)return results;
  }
  throw Error('Pagination exceeded');
}
export async function handlePersonalMatchRead(request,env){
  const url=new URL(request.url);
  const m=/^\/api\/personal\/(matchkonfiguration|laguppstallningar|bytesschema)$/.exec(url.pathname);
  if(!m)return respond(404,{ok:false,error:'Unknown match route'});
  if(request.method!=='GET')return respond(405,{ok:false,error:'Read only'});
  const teamIds=url.searchParams.getAll('team_id'), poolIds=url.searchParams.getAll('pool_id');
  const pages=url.searchParams.getAll('page'),sizes=url.searchParams.getAll('size');
  if(teamIds.length!==1||poolIds.length!==1||!validId(teamIds[0])||!validId(poolIds[0])||
    pages.length>1||sizes.length>1)return respond(400,{ok:false,error:'Invalid team/pool selection'});
  const page=Number(pages[0]||1),size=Number(sizes[0]||200);
  if(!Number.isSafeInteger(page)||page<1||page>1000||
    !Number.isSafeInteger(size)||size<1||size>200)
    return respond(400,{ok:false,error:'Invalid pagination'});
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN)return respond(503,{ok:false,error:'Authentication unavailable'});
  const verification=await handlePersonalTeamList(new Request(new URL('/api/personal/lag',url),request),env);
  if(!verification.ok)return verification;
  const own=await verification.json();
  if(!own.results?.some(x=>String(x.id)===teamIds[0]))
    return respond(403,{ok:false,error:'Team membership required'});
  try{
    const pools=await all(env,'poolspel');
    const pool=pools.find(p=>String(p.id)===poolIds[0]);
    if(!pool||!links(pool,'Lag').includes(teamIds[0]))
      return respond(403,{ok:false,error:'Pool does not belong to selected team'});
    const configs=(await all(env,'matchkonfiguration'))
      .filter(row=>links(row,'Poolspel').includes(poolIds[0]));
    // Only lineup rows linked to configurations in this verified pool may be returned.
    const verifiedConfigs=new Set(configs.map(x=>String(x.id)));
    let records;
    if(m[1]==='matchkonfiguration')records=configs;
    else{
      records=(await all(env,m[1])).filter(row=>{
        if(!links(row,'Poolspel').includes(poolIds[0]))return false;
        return m[1]==='laguppstallningar'
          ? links(row,'Matchkonfiguration').some(id=>verifiedConfigs.has(id))
          : true;
      });
    }
    const start=(page-1)*size;
    return respond(200,{ok:true,results:records.slice(start,start+size),
      next:start+size<records.length?page+1:null});
  }catch{return respond(503,{ok:false,error:'Match records unavailable'});}
}
