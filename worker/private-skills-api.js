import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {PRIMARY_ADMIN_ID} from './primary-administrator.js';
import {SKILL_GROUPS,SKILL_KEYS,planSkills} from './skills-planner.js';
const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const positive=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export function validSkillsCards(cards){return object(cards)&&Object.keys(cards).length<=200&&Object.entries(cards).every(([id,card])=>positive(id)&&object(card)&&Object.keys(card).every(k=>['ratings','notes'].includes(k))&&object(card.ratings)&&Object.keys(card.ratings).length===SKILL_KEYS.length&&SKILL_KEYS.every(k=>Object.hasOwn(card.ratings,k)&&(card.ratings[k]===null||Number.isInteger(card.ratings[k])&&card.ratings[k]>=1&&card.ratings[k]<=10))&&typeof card.notes==='string'&&card.notes.length<=1000);}
async function bodyOf(request,limit){
 const reader=request.body?.getReader();if(!reader)throw {status:400};const chunks=[];let size=0;
 for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw {status:413};}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw {status:400};}
}
function validPlan(input){
 if(!object(input)||Object.keys(input).some(k=>!['mode','playerIds','goalieIds','groupCount','playersOnField','shiftCount'].includes(k)))return false;
 const ids=a=>Array.isArray(a)&&a.length<=60&&a.every(positive)&&new Set(a).size===a.length;
 if(!ids(input.playerIds)||!ids(input.goalieIds)||input.goalieIds.length>2||input.goalieIds.some(id=>!input.playerIds.includes(id)))return false;
 const count=input.playerIds.length-input.goalieIds.length;
 return input.mode==='training'?[2,3,4].includes(input.groupCount)&&count>=input.groupCount:input.mode==='match'&&Number.isInteger(input.playersOnField)&&input.playersOnField>=1&&input.playersOnField<=6&&count>=input.playersOnField&&Number.isInteger(input.shiftCount)&&input.shiftCount>=1&&input.shiftCount<=60;
}
export function createPrivateSkillsHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env),readRoster}={}){
 return async request=>{
  const url=new URL(request.url),suggest=url.pathname==='/api/skills/suggest';
  if(!suggest&&url.pathname!=='/api/skills')return reply(404,{ok:false,error:'Okänd adress'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return reply(401,{ok:false,error:'Logga in först'});
  try{
   const actor=await verifyIdentity(token);if(!actor)return reply(401,{ok:false,error:'Logga in igen'});
   // Both the protected account and its server-derived primary flag are required.
   // Global administrators, team owners and browser flags never grant access here.
   if(actor.is_primary_admin!==true||actor.user?.id!==PRIMARY_ADMIN_ID)return reply(403,{ok:false,error:'Åtkomst nekad'});
   if(env.NSK_DISABLE_PRIVATE_SKILLS==='true')return reply(404,{ok:false,error:'Funktionen är avstängd'});
   if(!(suggest?['POST']:['GET','PUT','DELETE']).includes(request.method))return reply(405,{ok:false,error:'Otillåten metod'});
   const teamValues=url.searchParams.getAll('team_id');if(teamValues.length!==1||!positive(teamValues[0])||[...url.searchParams.keys()].some(k=>k!=='team_id'))return reply(400,{ok:false,error:'Välj ett lag'});
   const team=teamValues[0],access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   if(!access.memberships.some(m=>m.team_id===team)||!access.permissions.includes('read'))return reply(403,{ok:false,error:'Åtkomst nekad'});
   let data=null;
   if(request.method!=='GET'){
    if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))return reply(415,{ok:false,error:'JSON krävs'});
    data=await bodyOf(request,suggest?8000:260000);
    if(suggest?!validPlan(data):!object(data)||!Number.isSafeInteger(data.revision)||data.revision<0||Object.keys(data).some(k=>!(request.method==='DELETE'?['revision']:['revision','enabled','cards']).includes(k))||request.method==='PUT'&&(typeof data.enabled!=='boolean'||!validSkillsCards(data.cards)))return reply(400,{ok:false,error:'Kontrollera uppgifterna'});
   }
   const row=await env.AUTH_DB.prepare('SELECT cards_json,enabled,revision,updated_at FROM private_skills_boards WHERE team_id=?').bind(team).first();
   const revision=row?.revision||0,enabled=row?row.enabled===1:true,stored=row?JSON.parse(row.cards_json):{};
   if(suggest&&!enabled)return reply(409,{ok:false,error:'Skills är avstängt för laget'});
   if(data&&!suggest&&data.revision!==revision)return reply(409,{ok:false,error:'Uppgifterna har ändrats. Läs om innan du sparar.'});
   const roster=await readRoster(team),allowed=new Set(roster.map(p=>p.id));
   const cards=Object.fromEntries(Object.entries(stored).filter(([id])=>allowed.has(id)).map(([id,card])=>[id,{ratings:card.ratings,notes:card.notes}]));
   const assessedAt=Object.fromEntries(Object.keys(cards).map(id=>[id,stored[id].assessedAt||null]));
   if(request.method==='GET')return reply(200,{ok:true,enabled,revision,cards,assessedAt,roster,groups:SKILL_GROUPS,updatedAt:row?.updated_at||null});
   if(suggest){if(data.playerIds.some(id=>!allowed.has(id)))return reply(400,{ok:false,error:'Spelare saknas i valt lag'});const seed=crypto.getRandomValues(new Uint32Array(1))[0];return reply(200,{ok:true,revision,...planSkills(data,cards,seed)});}
   const nextCards=request.method==='DELETE'?{}:data.cards,nextEnabled=request.method==='DELETE'?false:data.enabled;
   if(Object.keys(nextCards).some(id=>!allowed.has(id)))return reply(400,{ok:false,error:'Spelare saknas i valt lag'});
   const now=new Date().toISOString(),nextStored=Object.fromEntries(Object.entries(nextCards).map(([id,card])=>[id,{...card,assessedAt:JSON.stringify(cards[id])===JSON.stringify(card)&&stored[id]?.assessedAt?stored[id].assessedAt:now}]));
   const nextDates=Object.fromEntries(Object.entries(nextStored).map(([id,card])=>[id,card.assessedAt]));
   const encoded=JSON.stringify(nextStored);if(new TextEncoder().encode(encoded).byteLength>250000)return reply(413,{ok:false,error:'För mycket data'});
   const result=revision===0
    ?await env.AUTH_DB.prepare('INSERT INTO private_skills_boards (team_id,cards_json,enabled,revision,updated_by) VALUES (?,?,?,1,?) ON CONFLICT(team_id) DO NOTHING').bind(team,encoded,nextEnabled?1:0,actor.user.id).run()
    :await env.AUTH_DB.prepare('UPDATE private_skills_boards SET cards_json=?,enabled=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND revision=?').bind(encoded,nextEnabled?1:0,actor.user.id,team,revision).run();
   if(!result.meta?.changes)return reply(409,{ok:false,error:'Uppgifterna har ändrats. Läs om innan du sparar.'});
   return reply(200,{ok:true,revision:revision+1,enabled:nextEnabled,cards:nextCards,assessedAt:nextDates});
  }catch(error){return reply(error.status||503,{ok:false,error:error.status===413?'För mycket data':error.status===400?'Ogiltig data':'Skills kunde inte hämtas eller sparas. Försök igen.'});}
 };
}
export async function readSkillsRoster(env,table,team,fetcher=fetch){
 const rows=[];
 for(let page=1;page<=20;page++){
  const path=`/api/database/rows/table/${table}/`,response=await fetcher('https://api.baserow.io'+path+`?user_field_names=true&size=200&page=${page}`,{headers:{Authorization:'Token '+env.BASEROW_TOKEN},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Roster unavailable');const data=await response.json();if(!Array.isArray(data.results)||data.results.length>200)throw Error('Invalid roster');
  for(const person of data.results)if(positive(String(person.id))&&typeof person.Namn==='string'&&Array.isArray(person.Lag)&&person.Lag.some(t=>String(typeof t==='object'?t.id:t)===team))rows.push({id:String(person.id),name:person.Namn.slice(0,150)});
  if(!data.next)return rows.sort((a,b)=>a.name.localeCompare(b.name,'sv'));
  const next=new URL(data.next);if(next.origin!=='https://api.baserow.io'||next.pathname!==path||next.searchParams.get('page')!==String(page+1))throw Error('Invalid cursor');
 }
 throw Error('Roster limit');
}
