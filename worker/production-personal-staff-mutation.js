// Isolated production-candidate staff mutation API. KV is keyed by the trusted
// numeric team; ownership and permission are verified before mutation.
import { verifyStagingSession } from './staging-session-identity.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';

const ROLES=new Set(['Lagledare','Fysansvarig','Materialförvaltare']);
const respond=(status,data)=>Response.json(data,{status,headers:{
  'cache-control':'no-store','x-content-type-options':'nosniff'}});
const error=(status,message)=>respond(status,{ok:false,error:message});
const validTeam=s=>typeof s==='string'&&/^[1-9]\d*$/.test(s)&&Number.isSafeInteger(Number(s));
const validId=s=>typeof s==='string'&&/^[a-f0-9-]{36}$/i.test(s);

async function listTeams(env) {
  const result=[];
  for(let page=1;page<=100;page++){
    const url='https://api.baserow.io/api/database/rows/table/1255083/?user_field_names=true&size=200&page='+page;
    const response=await fetch(url,{headers:{Authorization:'Token '+env.BASEROW_TOKEN}});
    if(!response.ok)throw Error('Teams unavailable');
    const data=await response.json();
    if(!Array.isArray(data?.results))throw Error('Invalid team response');
    result.push(...data.results);
    if(!data.next)return result;
  }
  throw Error('Too many team pages');
}

export async function handlePersonalStaffMutation(request,env) {
  const path=new URL(request.url).pathname;
  if(path!=='/api/personal/lagpersonal')return error(404,'Unknown staff route');
  if(!['POST','PATCH'].includes(request.method))return error(405,'Unsupported staff method');
  if(!env?.AUTH_DB||!env?.NSK_TRAINERS||!env?.BASEROW_TOKEN)
    return error(503,'Staff storage/authentication not configured');
  const auth=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'');
  if(!auth)return error(401,'Personal login required');
  let data;
  try{data=await request.json();}catch{return error(400,'Invalid JSON');}
  if(!data||typeof data!=='object'||Array.isArray(data))return error(400,'Invalid staff payload');
  const fields=request.method==='POST'?['team_id','role','name']:['team_id','role','name','id'];
  if(Object.keys(data).some(k=>!fields.includes(k))||!validTeam(data.team_id)||
    !ROLES.has(data.role)||typeof data.name!=='string'||
    !data.name.trim()||data.name.trim().length>150||
    (request.method==='PATCH'&&!validId(data.id)))
    return error(400,'Invalid staff fields');
  let actor;
  try{
    const session=await verifyStagingSession(auth[1],env);
    if(!session)return error(401,'Session expired');
    actor=mapTrustedMembershipsToLegacyTeams(session,await listTeams(env));
  }catch{return error(503,'Cannot verify trusted team membership');}
  const decision=authorizeTeamFeature(actor,data.team_id,'roster');
  if(!decision.allowed)return error(decision.status,decision.reason);
  const key='lagpersonal:team:'+data.team_id;
  try{
    const rows=await env.NSK_TRAINERS.get(key,'json');
    if(rows!==null&&!Array.isArray(rows))return error(503,'Invalid stored staff');
    const items=rows||[];
    let row;
    if(request.method==='POST'){
      if(items.some(x=>x.role===data.role&&
        x.name.toLocaleLowerCase('sv')===data.name.trim().toLocaleLowerCase('sv')))
        return error(409,'Personen finns redan');
      row={id:crypto.randomUUID(),name:data.name.trim(),role:data.role};
      items.push(row);
    }else{
      row=items.find(x=>x?.id===data.id&&x.role===data.role);
      if(!row)return error(404,'Staff member does not belong to selected team');
      row.name=data.name.trim();
    }
    await env.NSK_TRAINERS.put(key,JSON.stringify(items));
    return respond(request.method==='POST'?201:200,{ok:true,row});
  }catch{return error(503,'Staff storage unavailable');}
}
