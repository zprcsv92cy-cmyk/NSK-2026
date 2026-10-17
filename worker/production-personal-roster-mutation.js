// Controlled production roster writes. Never mounted in the deployed Worker
// until the production auth rollout and existing UI have been validated.
import { verifyStagingSession } from './staging-session-identity.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';

const B_TABLES=Object.freeze({spelare:1255098,tranare:1255100,lag:1255083});
const json=(status,error)=>Response.json({ok:false,error},{status,
  headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
const numeric=value=>typeof value==='string' && /^[1-9]\d*$/.test(value) &&
  Number.isSafeInteger(Number(value));
const ownTeam=(row,teamId)=>{
  const links=row?.Lag;
  return Array.isArray(links) && links.length===1 &&
    String(typeof links[0]==='object' ? links[0]?.id:links[0])===teamId;
};
async function baserow(request,env) {
  const response=await fetch(request,{headers:{Authorization:'Token '+env.BASEROW_TOKEN}});
  if(!response.ok) throw new Error('Baserow error');
  return response;
}
async function allTeams(env) {
  let teams=[];
  for(let page=1;page<=100;page++){
    const url=`https://api.baserow.io/api/database/rows/table/${B_TABLES.lag}/?user_field_names=true&size=200&page=${page}`;
    const data=await (await baserow(url,env)).json();
    if(!Array.isArray(data?.results))throw new Error('Invalid Baserow response');
    teams.push(...data.results);
    if(!data.next)return teams;
  }
  throw new Error('Too many Baserow pages');
}
/**
 * POST /api/personal/spelare|tranare with {name,team_id}
 * PATCH /api/personal/spelare|tranare/{id} with {name,team_id}
 * DELETE /api/personal/spelare|tranare/{id} with {team_id}
 * All operations independently verify a non-staging production session,
 * numeric team ownership and the team-specific roster:manage permission.
 */
export async function handlePersonalRosterMutation(request,env) {
  const url=new URL(request.url);
  const match=/^\/api\/personal\/(spelare|tranare)(?:\/(\d+))?$/.exec(url.pathname);
  if(!match)return json(404,'Unknown roster route');
  const method=request.method;
  if(!['POST','PATCH','DELETE'].includes(method))return json(405,'Unsupported method');
  if((method==='POST'&&match[2])||(method!=='POST'&&!match[2]))
    return json(405,'Unsupported route');
  if(!env?.AUTH_DB || !env?.BASEROW_TOKEN)return json(503,'Backend is not configured');
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return json(401,'Personal login required');
  let body;
  try{body=await request.json();}catch{return json(400,'Invalid JSON');}
  if(!body || typeof body!=='object' || Array.isArray(body))return json(400,'Invalid payload');
  // No data containing Baserow field overrides is accepted.
  const expectedKeys=method==='DELETE'?['team_id']:['team_id','name'];
  if(Object.keys(body).some(key=>!expectedKeys.includes(key)))
    return json(400,'Unexpected fields');
  const teamId=body.team_id;
  if(!numeric(teamId))return json(400,'Invalid team');
  const name=String(body.name||'').trim();
  if(method!=='DELETE' && (typeof body.name!=='string' || name.length<1 || name.length>150))
    return json(400,'Invalid name');
  if(match[2]&&!numeric(match[2]))return json(400,'Invalid row');
  let actor;
  try{
    const session=await verifyStagingSession(token,env);
    if(!session)return json(401,'Session expired');
    actor=mapTrustedMembershipsToLegacyTeams(session,await allTeams(env));
  }catch{return json(503,'Unable to verify trusted identity and team mapping');}
  const decision=authorizeTeamFeature(actor,teamId,'roster');
  if(!decision.allowed)return json(decision.status,decision.reason);
  const table=B_TABLES[match[1]],rowId=match[2];
  const base=`https://api.baserow.io/api/database/rows/table/${table}/`;
  try{
    if(method!=='POST'){
      const response=await fetch(base+rowId+'/?user_field_names=true',{
        headers:{Authorization:'Token '+env.BASEROW_TOKEN}
      });
      if(response.status===404)return json(404,'Roster entry not found');
      if(!response.ok)return json(502,'Baserow unavailable');
      const row=await response.json();
      if(!ownTeam(row,teamId))return json(403,'Roster entry belongs to another team');
    }
    const target=method==='POST'?base+'?user_field_names=true':base+rowId+'/?user_field_names=true';
    const result=await fetch(target,{
      method:method,
      headers:{Authorization:'Token '+env.BASEROW_TOKEN,
        ...(method==='DELETE'?{}:{'Content-Type':'application/json'})},
      ...(method==='DELETE'?{}:{body:JSON.stringify(method==='POST'?
        {Namn:name,Lag:[Number(teamId)]}:{Namn:name})})
    });
    if(!result.ok)return json(502,'Baserow write failed');
    if(method==='DELETE')return Response.json({ok:true},{headers:{'cache-control':'no-store'}});
    const row=await result.json();
    if(method==='POST'&&!ownTeam(row,teamId))
      return json(502,'Roster ownership could not be confirmed');
    return Response.json({ok:true,row},{status:method==='POST'?201:200,
      headers:{'cache-control':'no-store'}});
  }catch{return json(503,'Roster storage unavailable');}
}
