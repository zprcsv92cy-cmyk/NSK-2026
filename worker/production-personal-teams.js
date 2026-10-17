// Authenticated numeric team mapping for personal production endpoints.
// Never reveal the unfiltered Baserow team collection.
import { verifyStagingSession } from './staging-session-identity.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';

const reply=(status,body)=>Response.json(body,{status,headers:{
  'cache-control':'no-store','x-content-type-options':'nosniff'}});
async function teamsFromBaserow(env) {
  const rows=[];
  for(let page=1;page<=100;page++){
    const url='https://api.baserow.io/api/database/rows/table/1255083/?user_field_names=true&size=200&page='+page;
    const response=await fetch(url,{headers:{Authorization:'Token '+env.BASEROW_TOKEN}});
    if(!response.ok)throw Error('Team service unavailable');
    const data=await response.json();
    if(!Array.isArray(data?.results))throw Error('Invalid team data');
    rows.push(...data.results);
    if(!data.next)return rows;
  }
  throw Error('Too many teams');
}
export async function handlePersonalTeamList(request,env){
  if(new URL(request.url).pathname!=='/api/personal/lag')return reply(404,{ok:false,error:'Unknown route'});
  if(request.method!=='GET')return reply(405,{ok:false,error:'Read only'});
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN)return reply(503,{ok:false,error:'Personal auth unavailable'});
  const match=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'');
  if(!match)return reply(401,{ok:false,error:'Personal login required'});
  let actor;
  try{
    const session=await verifyStagingSession(match[1],env);
    if(!session)return reply(401,{ok:false,error:'Session expired'});
    const teams=await teamsFromBaserow(env);
    actor=mapTrustedMembershipsToLegacyTeams(session,teams);
    const results=actor.memberships.map(m=>{
      const t=teams.find(t=>String(t.id)===m.team_id);
      return {id:Number(t.id),Namn:t.Namn,'Säsong':t['Säsong']};
    });
    return reply(200,{ok:true,results});
  }catch{return reply(503,{ok:false,error:'Unable to resolve trusted team membership'});}
}
