// Production candidate: personally authorized lineup write (no legacy admin token).
// Baserow row updates are sequential; failure stops without deleting old rows.
import { verifyStagingSession } from './staging-session-identity.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';
import { authorizeTeamFeature } from './team-authorization-policy.js';

const tables={lag:1255083,poolspel:1255101,matchkonfiguration:1255157,
  spelare:1255098,tranare:1255100,laguppstallningar:1255113};
const fail=(status,error)=>Response.json({ok:false,error},{status,
  headers:{'cache-control':'no-store'}});
const valid=x=>Number.isSafeInteger(x)&&x>0;
const ids=x=>Array.isArray(x)?x.map(v=>Number(v&&typeof v==='object'?v.id:v)):[];
const url=(t,id)=>'https://api.baserow.io/api/database/rows/table/'+tables[t]+'/'+(id?id+'/':'')+'?user_field_names=true';
const headers=env=>({Authorization:'Token '+env.BASEROW_TOKEN});
async function one(env,t,id){
  const r=await fetch(url(t,id),{headers:headers(env)});
  if(r.status===404)return null;
  if(!r.ok)throw Error('Baserow unavailable');
  return r.json();
}
async function all(env,t){
  const rows=[];
  for(let page=1;page<=100;page++){
    const r=await fetch(url(t)+'&page='+page+'&size=200',{headers:headers(env)});
    if(!r.ok)throw Error('Baserow unavailable');
    const d=await r.json();
    if(!Array.isArray(d?.results))throw Error('Invalid Baserow page');
    rows.push(...d.results);
    if(!d.next)return rows;
  }
  throw Error('Pagination limit');
}
export async function handlePersonalLineupWrite(request,env){
  const m=/^\/api\/personal\/laguppstallningar\/(\d+)$/.exec(new URL(request.url).pathname);
  if(!m)return fail(404,'Okänd laguppställningsväg');
  if(request.method!=='POST')return fail(405,'Otillåten metod');
  if(!env?.AUTH_DB||!env?.BASEROW_TOKEN)return fail(503,'Autentisering saknas');
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return fail(401,'Personlig inloggning krävs');
  let body;
  try{body=await request.json();}catch{return fail(400,'Ogiltig JSON');}
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['team_id','players','coaches'].includes(k))||
    typeof body.team_id!=='string'||!/^[1-9]\d*$/.test(body.team_id)||
    !Number.isSafeInteger(Number(body.team_id))||
    !Array.isArray(body.players)||!Array.isArray(body.coaches)||
    body.players.length>25||body.coaches.length>20||
    [...body.players,...body.coaches].some(x=>!valid(x))||
    new Set(body.players).size!==body.players.length||
    new Set(body.coaches).size!==body.coaches.length)
    return fail(400,'Ogiltiga spelare eller tränare');
  const configId=Number(m[1]);
  if(!valid(configId))return fail(400,'Ogiltigt match-ID');
  try{
    const session=await verifyStagingSession(token,env);
    if(!session)return fail(401,'Inloggningen har gått ut');
    const actor=mapTrustedMembershipsToLegacyTeams(session,await all(env,'lag'));
    const decision=authorizeTeamFeature(actor,body.team_id,'lineup');
    if(!decision.allowed)return fail(decision.status,decision.reason);
    const cfg=await one(env,'matchkonfiguration',configId);
    if(!cfg||ids(cfg.Poolspel).length!==1)return fail(403,'Matchen saknas eller är tvetydig');
    const poolId=ids(cfg.Poolspel)[0];
    const pool=await one(env,'poolspel',poolId);
    if(!pool||!ids(pool.Lag).includes(Number(body.team_id)))
      return fail(403,'Matchen tillhör ett annat lag');
    const [players,coaches,allLineups]=await Promise.all([
      all(env,'spelare'),all(env,'tranare'),all(env,'laguppstallningar')
    ]);
    const ownPlayers=new Set(players.filter(p=>ids(p.Lag).includes(Number(body.team_id))).map(x=>x.id));
    const ownCoaches=new Set(coaches.filter(p=>ids(p.Lag).includes(Number(body.team_id))).map(x=>x.id));
    if(body.players.some(x=>!ownPlayers.has(x))||body.coaches.some(x=>!ownCoaches.has(x)))
      return fail(403,'Valda personer tillhör ett annat lag');
    const existing=allLineups.filter(row=>ids(row.Matchkonfiguration).includes(configId));
    // Refuse any row whose pool link is not the validated pool.
    if(existing.some(row=>ids(row.Poolspel).length!==1||ids(row.Poolspel)[0]!==poolId))
      return fail(409,'Motstridiga befintliga laguppställningar');
    existing.sort((a,b)=>Number(a.id)-Number(b.id));
    const entries=[
      ...body.players.map((id,i)=>({id,type:'Spelare',order:i+1})),
      ...body.coaches.map((id,i)=>({id,type:'Tränare',order:body.players.length+i+1}))
    ];
    for(let i=0;i<entries.length;i++){
      const item=entries[i],old=existing[i];
      const payload={Poolspel:[poolId],Matchkonfiguration:[configId],
        Persontyp:item.type,'Person-ID':item.id,Sorteringsordning:item.order};
      const resp=await fetch(url('laguppstallningar',old?.id),{
        method:old?'PATCH':'POST',headers:{...headers(env),'Content-Type':'application/json'},
        body:JSON.stringify(payload)
      });
      if(!resp.ok)return fail(502,'Delvis sparad uppställning; försök igen');
    }
    // A failed save never removes rows; bounded cleanup matches legacy semantics.
    let removed=0;
    for(const old of existing.slice(entries.length,entries.length+10)){
      const resp=await fetch(url('laguppstallningar',old.id),{method:'DELETE',headers:headers(env)});
      if(!resp.ok&&resp.status!==404)return fail(502,'Uppställningen sparades men rensning misslyckades');
      removed++;
    }
    return Response.json({ok:true,count:entries.length,duplicates_removed:removed,
      cleanup_pending:existing.length>entries.length+removed},{
      headers:{'cache-control':'no-store'}
    });
  }catch{return fail(503,'Laguppställningen kunde inte verifieras eller sparas');}
}
