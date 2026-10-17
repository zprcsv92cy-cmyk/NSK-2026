// Production candidate: personally authorized shift completion.
// Validate persisted shift ownership before invoking the existing ShiftLock.
import { verifyStagingSession } from './staging-session-identity.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';

const TABLE={lag:1255083,poolspel:1255101,bytesschema:1255115};
const fail=(status,error)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
const pos=x=>Number.isSafeInteger(x)&&x>0;
const ids=value=>Array.isArray(value)?value.map(v=>Number(v&&typeof v==='object'?v.id:v)):[];
async function getRow(env,table,id){
  const r=await fetch('https://api.baserow.io/api/database/rows/table/'+TABLE[table]+'/'+id+'/?user_field_names=true',{
    headers:{Authorization:'Token '+env.BASEROW_TOKEN}});
  if(r.status===404)return null;
  if(!r.ok)throw Error('Baserow unavailable');
  return r.json();
}
async function getTeams(env){
  const all=[];
  for(let page=1;page<=100;page++){
    const r=await fetch('https://api.baserow.io/api/database/rows/table/'+TABLE.lag+'/?user_field_names=true&page='+page+'&size=200',{
      headers:{Authorization:'Token '+env.BASEROW_TOKEN}});
    if(!r.ok)throw Error('Team database unavailable');
    const data=await r.json();
    if(!Array.isArray(data?.results))throw Error('Invalid team page');
    all.push(...data.results);
    if(!data.next)return all;
  }
  throw Error('Too many teams');
}
export async function handlePersonalShiftDone(request,env){
  const match=/^\/api\/personal\/bytesschema\/(\d+)\/done$/.exec(new URL(request.url).pathname);
  if(!match)return fail(404,'Okänt byte');
  if(request.method!=='PATCH')return fail(405,'Metoden är inte tillåten');
  const id=Number(match[1]);
  if(!pos(id))return fail(400,'Ogiltigt byte-ID');
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN||!env?.SHIFT_LOCK)
    return fail(503,'Behörighet eller bytestjänst saknas');
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return fail(401,'Personlig inloggning krävs');
  let body;
  try{body=await request.json();}catch{return fail(400,'Ogiltig JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['team_id','done'].includes(k))||
    typeof body.team_id!=='string'||!/^[1-9]\d*$/.test(body.team_id)||
    !Number.isSafeInteger(Number(body.team_id))||typeof body.done!=='boolean')
    return fail(400,'Ogiltigt lag eller bytevärde');
  try{
    const session=await verifyStagingSession(token,env);
    if(!session)return fail(401,'Sessionen har gått ut');
    const actor=mapTrustedMembershipsToLegacyTeams(session,await getTeams(env));
    const decision=authorizeTeamFeature(actor,body.team_id,'shifts');
    if(!decision.allowed)return fail(decision.status,decision.reason);
    // Ownership is from persisted shift -> pool, never from untrusted body.
    const shift=await getRow(env,'bytesschema',id);
    if(!shift)return fail(404,'Bytet saknas');
    const poolIds=ids(shift.Poolspel);
    const lagNo=Number(shift.Lagnummer),matchNo=Number(shift.Matchnummer);
    if(poolIds.length!==1||!pos(poolIds[0])||!pos(lagNo)||!pos(matchNo))
      return fail(409,'Bytets kopplingar är ogiltiga');
    const pool=await getRow(env,'poolspel',poolIds[0]);
    if(!pool||!ids(pool.Lag).includes(Number(body.team_id)))
      return fail(403,'Bytet tillhör ett annat lag');
    if(lagNo>Number(pool['Antal lag'])||matchNo>Number(pool['Antal matcher']))
      return fail(409,'Bytet tillhör en ogiltig match');
    const stub=env.SHIFT_LOCK.get(env.SHIFT_LOCK.idFromName(poolIds[0]+':'+lagNo+':'+matchNo));
    const result=await stub.fetch('https://shift-lock.internal/',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'done',id,pool_id:poolIds[0],lag_no:lagNo,match_no:matchNo,done:body.done})
    });
    const headers=new Headers(result.headers);
    headers.set('Cache-Control','no-store');
    return new Response(result.body,{status:result.status,headers});
  }catch{return fail(503,'Kunde inte verifiera eller ändra bytet');}
}
