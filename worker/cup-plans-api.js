import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {authorizeTeamFeature} from './team-authorization-policy.js';
import {discoverCups} from './cup-discovery.js';
import {cupAddress,importCuponline,limitedCupBody,validCup} from './cuponline-import.js';
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export function createCupPlansHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env),fetcher=fetch}={}){
 return async request=>{
  const url=new URL(request.url),teams=url.searchParams.getAll('team_id');
  if(url.pathname!=='/api/cups')return reply(404,{ok:false,error:'Okänd adress.'});
  if(!['GET','POST','PUT','DELETE'].includes(request.method))return reply(405,{ok:false,error:'Otillåten metod.'});
  if(teams.length!==1||! /^[1-9][0-9]*$/.test(teams[0]))return reply(400,{ok:false,error:'Välj ett lag.'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return reply(401,{ok:false,error:'Logga in först.'});
  try{
   const actor=await verifyIdentity(token);if(!actor)return reply(401,{ok:false,error:'Logga in igen.'});
   const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   if(!access.memberships.some(m=>m.team_id===teams[0])||!access.permissions.includes('read'))return reply(403,{ok:false,error:'Ingen åtkomst till laget.'});
   const canEdit=authorizeTeamFeature(access,teams[0],'pool').allowed;
   if(request.method!=='GET'&&!canEdit)return reply(403,{ok:false,error:'Behörighet att skapa poolspel krävs för att planera cuper.'});
   const db=env.AUTH_DB;
   if(request.method==='GET'&&url.searchParams.get('action')==='discover'){
    const ages=url.searchParams.getAll('age'),offsets=url.searchParams.getAll('offset'),offset=Number(offsets[0]||0);
    if(ages.length!==1||!/^U(?:[7-9]|1[0-9]|20)$/.test(ages[0])||offsets.length>1||!Number.isSafeInteger(offset)||offset<0||offset>1000)return reply(400,{ok:false,error:'Välj en åldersklass mellan U7 och U20.'});
    try{return reply(200,{ok:true,...await discoverCups(ages[0],offset,{fetcher})});}catch{return reply(502,{ok:false,error:'Cuponlines cuplista kunde inte hämtas just nu. Försök igen senare eller lägg till en cup via dess adress.'});}
   }
   if(request.method==='GET'){
    const rows=await db.prepare('SELECT cup_json,notes,status,revision,updated_at FROM cup_plans WHERE team_id=? ORDER BY updated_at DESC LIMIT 100').bind(teams[0]).all();
    return reply(200,{ok:true,canEdit,plans:(rows.results||[]).map(row=>({cup:JSON.parse(row.cup_json),notes:row.notes,status:row.status,revision:row.revision,updatedAt:row.updated_at}))});
   }
   let body;try{body=await limitedCupBody(request);}catch(error){return reply(400,{ok:false,error:error.message});}
   if(request.method==='POST'){
    if(!body||Object.keys(body).length!==1||typeof body.url!=='string')return reply(400,{ok:false,error:'Ange en Cuponline-adress.'});
    try{cupAddress(body.url);}catch(error){return reply(400,{ok:false,error:error.message});}
    try{return reply(200,{ok:true,cup:await importCuponline(body.url,fetcher)});}catch{return reply(502,{ok:false,error:'Cupen kunde inte hämtas från Cuponline. Kontrollera adressen och försök igen.'});}
   }
   if(!body||!Number.isSafeInteger(body.revision)||body.revision<0)return reply(400,{ok:false,error:'Läs om cupen före ändringen.'});
   let result;
   if(request.method==='DELETE'){
    if(!/^[1-9][0-9]{0,8}$/.test(body.cupId)||body.revision<1)return reply(400,{ok:false,error:'Ogiltig cup.'});
    result=await db.prepare('DELETE FROM cup_plans WHERE team_id=? AND cup_id=? AND revision=?').bind(teams[0],body.cupId,body.revision).run();
   }else{
    if(!validCup(body.cup)||typeof body.notes!=='string'||body.notes.length>5000||!['Planerad','Anmäld','Avslutad'].includes(body.status))return reply(400,{ok:false,error:'Kontrollera cupuppgifterna.'});
    const values=[JSON.stringify(body.cup),body.notes,body.status,String(actor.user.id)];
    result=body.revision===0
     ?await db.prepare('INSERT INTO cup_plans (team_id,cup_id,cup_json,notes,status,updated_by) VALUES (?,?,?,?,?,?) ON CONFLICT(team_id,cup_id) DO NOTHING').bind(teams[0],body.cup.cupId,...values).run()
     :await db.prepare('UPDATE cup_plans SET cup_json=?,notes=?,status=?,updated_by=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND cup_id=? AND revision=?').bind(...values,teams[0],body.cup.cupId,body.revision).run();
   }
   if(result.meta?.changes!==1)return reply(409,{ok:false,error:'Cupen har ändrats av någon annan eller finns redan. Ladda om listan.'});
   return reply(200,{ok:true,revision:body.revision+1,deleted:request.method==='DELETE'});
  }catch{return reply(503,{ok:false,error:'Cupplaneraren kunde inte nås. Försök igen.'});}
 };
}
