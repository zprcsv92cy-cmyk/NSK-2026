// Personally authorized production match configuration mutations.
// Candidate only; does not deploy or reuse legacy admin tokens.
import { verifyStagingSession } from './staging-session-identity.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';

const TABLE={lag:1255083,poolspel:1255101,spelare:1255098,matchkonfiguration:1255157};
const reply=(status,error)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
const positive=x=>Number.isSafeInteger(x)&&x>0;
const links=x=>Array.isArray(x)?x.map(v=>Number(v&&typeof v==='object'?v.id:v)):[];
async function getRow(env,table,id){
  const resp=await fetch(`https://api.baserow.io/api/database/rows/table/${TABLE[table]}/${id}/?user_field_names=true`,{
    headers:{Authorization:'Token '+env.BASEROW_TOKEN}
  });
  if(resp.status===404)return null;
  if(!resp.ok)throw Error('Baserow unavailable');
  return resp.json();
}
async function getAll(env,table){
  const result=[];
  for(let page=1;page<=100;page++){
    const resp=await fetch(`https://api.baserow.io/api/database/rows/table/${TABLE[table]}/?user_field_names=true&page=${page}&size=200`,{
      headers:{Authorization:'Token '+env.BASEROW_TOKEN}
    });
    if(!resp.ok)throw Error('Baserow unavailable');
    const data=await resp.json();
    if(!Array.isArray(data?.results))throw Error('Invalid upstream rows');
    result.push(...data.results);
    if(!data.next)return result;
  }
  throw Error('Baserow pagination exceeded');
}
export async function handlePersonalMatchConfigWrite(request,env){
  const path=new URL(request.url).pathname;
  const m=/^\/api\/personal\/matchkonfiguration(?:\/(\d+))?$/.exec(path);
  if(!m)return reply(404,'Okänd matchväg');
  if(!['POST','PATCH'].includes(request.method)|| (request.method==='POST'&&m[1])||
      (request.method==='PATCH'&&!m[1]))return reply(405,'Otillåten metod');
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN)return reply(503,'Autentisering eller databas saknas');
  const bearer=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'');
  if(!bearer)return reply(401,'Personlig inloggning krävs');
  let body;
  try{body=await request.json();}catch{return reply(400,'Ogiltig JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,'Ogiltig data');
  const fields=['team_id','pool_id','lag_no','match_no','start_time','opponent','plan','player_count','goalie_player_id','players_on_field'];
  if(Object.keys(body).some(k=>!fields.includes(k)) ||
      typeof body.team_id!=='string'||!/^[1-9]\d*$/.test(body.team_id)||
      !Number.isSafeInteger(Number(body.team_id))||
      ![body.pool_id,body.lag_no,body.match_no,body.player_count,body.goalie_player_id].every(positive)||
      body.player_count>25||!Array.isArray(body.players_on_field)||
      !body.players_on_field.length||body.players_on_field.some(x=>!positive(x))||
      new Set(body.players_on_field).size!==body.players_on_field.length||
      !body.players_on_field.includes(body.goalie_player_id)||
      (body.start_time!=null&&(typeof body.start_time!=='string'|| !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(body.start_time)))||
      typeof body.opponent!=='string'||body.opponent.length>150||
      typeof body.plan!=='string'||body.plan.length>80)
    return reply(400,'Ogiltiga matchfält');
  try{
    const session=await verifyStagingSession(bearer[1],env);
    if(!session)return reply(401,'Sessionen har gått ut');
    const teams=await getAll(env,'lag');
    const actor=mapTrustedMembershipsToLegacyTeams(session,teams);
    const access=authorizeTeamFeature(actor,body.team_id,'matches');
    if(!access.allowed)return reply(access.status,access.reason);
    const pool=await getRow(env,'poolspel',body.pool_id);
    if(!pool||!links(pool.Lag).includes(Number(body.team_id)))
      return reply(403,'Poolspelet tillhör inte valt lag');
    if(body.lag_no>Number(pool['Antal lag'])||
       body.match_no>Number(pool['Antal matcher']))
      return reply(400,'Lagnummer eller matchnummer utanför poolspelet');
    if(m[1]){
      const old=await getRow(env,'matchkonfiguration',Number(m[1]));
      if(!old||!links(old.Poolspel).includes(body.pool_id)||
        Number(old.Lagnummer)!==body.lag_no||
        Number(old.Matchnummer)!==body.match_no)
        return reply(403,'Matchkonfigurationen tillhör en annan match');
    }
    const players=await getAll(env,'spelare');
    const allowed=new Set(players.filter(p=>links(p.Lag).includes(Number(body.team_id))).map(p=>p.id));
    if(body.players_on_field.some(id=>!allowed.has(id)))
      return reply(403,'Valda spelare eller målvakt tillhör ett annat lag');
    const payload={Poolspel:[body.pool_id],Lagnummer:body.lag_no,Matchnummer:body.match_no,
      Starttid:body.start_time||null,Motståndare:body.opponent,Plan:body.plan,
      'Antal spelare':body.player_count,Målvakt:[body.goalie_player_id],
      'Spelare på plan':body.players_on_field};
    const target=`https://api.baserow.io/api/database/rows/table/${TABLE.matchkonfiguration}/${m[1]?m[1]+'/':''}?user_field_names=true`;
    const response=await fetch(target,{method:request.method,headers:{
      Authorization:'Token '+env.BASEROW_TOKEN,'Content-Type':'application/json'
    },body:JSON.stringify(payload)});
    if(!response.ok)return reply(502,'Matchkonfigurationen kunde inte sparas');
    return Response.json({ok:true,row:await response.json()},{status:request.method==='POST'?201:200,
      headers:{'cache-control':'no-store'}});
  }catch{return reply(503,'Kunde inte verifiera lag eller spara matchen');}
}
