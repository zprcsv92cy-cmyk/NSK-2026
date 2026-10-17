// Authenticated entrypoint for serialized multi-team shift saving.
import {verifyStagingSession} from './staging-session-identity.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {authorizeTeamFeature} from './team-authorization-policy.js';

const fail=(status,error)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
const pos=x=>Number.isSafeInteger(x)&&x>0;
const ids=a=>Array.isArray(a)?a.map(x=>Number(x&&typeof x==='object'?x.id:x)):[];
async function listTeams(env){
  const result=[];
  for(let page=1;page<=100;page++){
    const r=await fetch('https://api.baserow.io/api/database/rows/table/1255083/?user_field_names=true&size=200&page='+page,{
      headers:{Authorization:'Token '+env.BASEROW_TOKEN}});
    if(!r.ok)throw Error('Teams unavailable');
    const data=await r.json();
    if(!Array.isArray(data?.results))throw Error('Invalid team page');
    result.push(...data.results);
    if(!data.next)return result;
  }
  throw Error('Too many teams');
}
export async function handlePersonalShiftSave(request,env){
  if(new URL(request.url).pathname!=='/api/personal/bytesschema/save')return fail(404,'Okänd bytesschemaväg');
  if(request.method!=='POST')return fail(405,'Otillåten metod');
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN||!env?.SHIFT_SAVE_LOCK)
    return fail(503,'Personlig autentisering eller bytelås saknas');
  const bearer=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'');
  if(!bearer)return fail(401,'Personlig inloggning krävs');
  let body;
  try{body=await request.json();}catch{return fail(400,'Ogiltig JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['team_id','pool_id','lag_no','match_no','shifts'].includes(k))||
    typeof body.team_id!=='string'||!/^[1-9]\d*$/.test(body.team_id)||
    !Number.isSafeInteger(Number(body.team_id))||
    ![body.pool_id,body.lag_no,body.match_no].every(pos)||
    !Array.isArray(body.shifts)||body.shifts.length>200)
    return fail(400,'Ogiltigt bytesschema');
  try{
    const session=await verifyStagingSession(bearer[1],env);
    if(!session)return fail(401,'Inloggningen har gått ut');
    const actor=mapTrustedMembershipsToLegacyTeams(session,await listTeams(env));
    const decision=authorizeTeamFeature(actor,body.team_id,'shifts');
    if(!decision.allowed)return fail(decision.status,decision.reason);
    // This permission check is followed by an independent pool, player and
    // existing-record ownership check inside the serialized durable object.
    const verified={...body,team_id:Number(body.team_id)};
    const key=body.pool_id+':'+body.lag_no+':'+body.match_no;
    const stub=env.SHIFT_SAVE_LOCK.get(env.SHIFT_SAVE_LOCK.idFromName(key));
    const result=await stub.fetch('https://personal-shift-lock.internal/',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(verified)});
    const headers=new Headers(result.headers);headers.set('Cache-Control','no-store');
    return new Response(result.body,{status:result.status,headers});
  }catch{return fail(503,'Bytesschema kunde inte verifieras');}
}
