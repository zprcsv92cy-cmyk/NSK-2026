// Read-only production poolspel endpoint. No legacy public table fallback.
// Scope comes from verified personal session, never from client team assertion.
import { handlePersonalTeamList } from './production-personal-teams.js';

const TABLE=1255101;
const error=(status,message)=>Response.json({ok:false,error:message},{status,
  headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const numeric=v=>typeof v==='string'&&/^[1-9]\d*$/.test(v)&&Number.isSafeInteger(Number(v));
const linked=(row,teamId)=>Array.isArray(row?.Lag)&&row.Lag.some(v=>
  String(v&&typeof v==='object'?v.id:v)===teamId);

export async function handlePersonalPoolList(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/personal/poolspel')return error(404,'Unknown personal pool route');
  if(request.method!=='GET')return error(405,'Read only');
  const teams=url.searchParams.getAll('team_id');
  const pages=url.searchParams.getAll('page'),sizes=url.searchParams.getAll('size');
  if(teams.length!==1||!numeric(teams[0])||pages.length>1||sizes.length>1)
    return error(400,'Invalid team or pagination');
  const page=Number(pages[0]||1),size=Number(sizes[0]||200);
  if(!Number.isSafeInteger(page)||page<1||page>1000||
    !Number.isSafeInteger(size)||size<1||size>200)
    return error(400,'Invalid pagination');
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN)return error(503,'Personal database unavailable');
  // Reuse the D1-verified identity + authoritative name/season -> numeric ID mapping.
  const teamResponse=await handlePersonalTeamList(new Request(
    new URL('/api/personal/lag',request.url),request),env);
  if(!teamResponse.ok)return teamResponse;
  const verified=await teamResponse.json();
  if(!verified.results?.some(row=>String(row.id)===teams[0]))
    return error(403,'No access to selected team');
  try{
    const rows=[];
    for(let sourcePage=1;sourcePage<=100;sourcePage++){
      const target='https://api.baserow.io/api/database/rows/table/'+TABLE+
        '/?user_field_names=true&page='+sourcePage+'&size=200';
      const upstream=await fetch(target,{
        headers:{Authorization:'Token '+env.BASEROW_TOKEN},
        signal:AbortSignal.timeout(15000)
      });
      if(!upstream.ok)throw Error('Pool table unavailable');
      const data=await upstream.json();
      if(!Array.isArray(data?.results))throw Error('Invalid pool table');
      rows.push(...data.results.filter(row=>linked(row,teams[0])));
      if(!data.next){
        const from=(page-1)*size;
        return Response.json({ok:true,results:rows.slice(from,from+size),
          next:from+size<rows.length?page+1:null},{
          headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}
        });
      }
    }
    return error(503,'Pool pagination limit reached');
  }catch{return error(503,'Pool data temporarily unavailable');}
}
