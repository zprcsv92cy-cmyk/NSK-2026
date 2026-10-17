// Separate, fail-closed personal roster endpoint for future nsk-api production deployment.
// Does not activate or modify legacy API routes. Requires a separate AUTH_DB D1 binding.
import { verifyStagingSession } from './staging-session-identity.js';
import { readPersonallyAuthorizedScopedRoster } from './production-roster-read-integration.js';

const TABLES = Object.freeze({ lag: 1255083, spelare: 1255098, tranare: 1255100 });
const APP_ORIGIN = 'https://zprcsv92cy-cmyk.github.io';
const deny = (status, error) => Response.json({ok:false,error}, {status,
  headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});

async function fetchBaserowPage(env, table, page) {
  if (!env?.BASEROW_TOKEN || !Number.isSafeInteger(TABLES[table])) throw new Error('Baserow not configured');
  const url = new URL('https://api.baserow.io/api/database/rows/table/' + TABLES[table] + '/');
  url.searchParams.set('user_field_names','true');
  url.searchParams.set('page',String(page));
  url.searchParams.set('size','200');
  const response = await fetch(url, {
    headers:{Authorization:'Token '+env.BASEROW_TOKEN},
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('Baserow unavailable');
  const data=await response.json();
  if (!Array.isArray(data?.results)) throw new Error('Baserow invalid response');
  return data;
}
async function fetchAllRows(env, table) {
  const all=[];
  for(let page=1;page<=100;page++){
    const data=await fetchBaserowPage(env,table,page);
    all.push(...data.results);
    if (!data.next) return all;
  }
  throw new Error('Baserow pagination limit reached');
}
function corsResponse(response, origin) {
  const headers = new Headers(response.headers);
  headers.set('cache-control','no-store');
  headers.set('vary','Origin');
  headers.set('x-content-type-options','nosniff');
  if(origin===APP_ORIGIN) headers.set('access-control-allow-origin',APP_ORIGIN);
  return new Response(response.body,{status:response.status,headers});
}

export async function handlePersonalRosterRead(request,env) {
  const url=new URL(request.url), origin=request.headers.get('Origin');
  if (origin && origin!==APP_ORIGIN) return deny(403,'Origin not allowed');
  if (request.method==='OPTIONS') {
    if(origin!==APP_ORIGIN) return deny(403,'Origin not allowed');
    return new Response(null,{status:204,headers:{
      'access-control-allow-origin':APP_ORIGIN,
      'access-control-allow-methods':'GET,OPTIONS',
      'access-control-allow-headers':'Authorization,Content-Type',
      'access-control-max-age':'600','vary':'Origin'
    }});
  }
  const match=/^\/api\/personal\/(spelare|tranare|lagpersonal)$/.exec(url.pathname);
  if(!match)return corsResponse(deny(404,'Unknown personal route'),origin);
  if(request.method!=='GET')return corsResponse(deny(405,'Read only'),origin);
  if(!env?.AUTH_DB || !env?.BASEROW_TOKEN)
    return corsResponse(deny(503,'Personal authentication not configured'),origin);
  const values=url.searchParams.getAll('team_id');
  if(values.length!==1 || !/^[1-9]\d*$/.test(values[0]) ||
     !Number.isSafeInteger(Number(values[0])))
    return corsResponse(deny(400,'Valid team_id required'),origin);
  const numericTeam=values[0];
  const internal=new URL(request.url);
  internal.pathname='/api/'+match[1];
  const normalized=new Request(internal.toString(),request);
  const response=await readPersonallyAuthorizedScopedRoster(normalized,{
    verifyPersonalSession:async req=>{
      const auth=req.headers.get('Authorization')||'';
      const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(auth)?.[1];
      return token ? verifyStagingSession(token,env) : null;
    },
    listTrustedTeams:()=>fetchAllRows(env,'lag'),
    resolveOwnerTeam:async()=> {
      // Numeric selection is accepted only after membership is verified
      // by production-roster-read-guard against trusted AUTH_DB/lag mapping.
      const teams=await fetchAllRows(env,'lag');
      if(teams.filter(t=>String(t?.id)===numericTeam).length!==1)
        throw new Error('Unknown team');
      return numericTeam;
    },
    fetchAllRosterRows:table=>fetchAllRows(env,table),
    fetchTeamStaff:async team=>{
      if(!env.NSK_TRAINERS)throw new Error('Staff KV missing');
      const rows=await env.NSK_TRAINERS.get('lagpersonal:team:'+team,'json');
      if(rows!==null && !Array.isArray(rows))throw new Error('Invalid stored staff');
      return rows||[];
    }
  });
  return corsResponse(response,origin);
}
