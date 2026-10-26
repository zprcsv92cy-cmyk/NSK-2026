import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {authorizeTeamFeature} from './team-authorization-policy.js';

const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(v);
const personId=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v));
const skateLimits={model:100,hollow:60,profile:100,notes:500};
const profileLimits={number:3,position:60,hand:5,...skateLimits};
export const emptyPersonCard=()=>({number:'',position:'',hand:'',model:'',hollow:'',profile:'',notes:''});
export function validatePersonCard(data){
 return !!data&&typeof data==='object'&&!Array.isArray(data)&&Object.keys(data).length===Object.keys(profileLimits).length&&Object.keys(data).every(k=>Object.hasOwn(profileLimits,k)&&typeof data[k]==='string'&&data[k].length<=profileLimits[k])&&/^\d{0,3}$/.test(data.number)&&['','Right','Left'].includes(data.hand);
}
const validSkates=s=>s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).length===4&&Object.keys(s).every(k=>Object.hasOwn(skateLimits,k)&&typeof s[k]==='string'&&s[k].length<=skateLimits[k]);
const skatesFrom=card=>Object.fromEntries(Object.keys(skateLimits).map(k=>[k,card?.[k]||'']));
export function validateEquipmentBoard(data){
 if(!data||Object.keys(data).some(k=>!['revision','requests','checklists'].includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0)return false;
 const unique=rows=>rows.every(r=>r&&typeof r==='object')&&new Set(rows.map(r=>r.id)).size===rows.length;
 return Array.isArray(data.requests)&&data.requests.length<=300&&unique(data.requests)&&data.requests.every(r=>r&&Object.keys(r).every(k=>['id','kind','personId','name','note','done','skates'].includes(k))&&id(r.id)&&['player','coach'].includes(r.kind)&&personId(r.personId)&&text(r.name,150)&&typeof r.note==='string'&&r.note.length<=300&&typeof r.done==='boolean'&&(r.skates===undefined||validSkates(r.skates)))&&
 Array.isArray(data.checklists)&&data.checklists.length<=30&&unique(data.checklists)&&data.checklists.every(c=>c&&Object.keys(c).every(k=>['id','title','items'].includes(k))&&id(c.id)&&text(c.title,100)&&Array.isArray(c.items)&&c.items.length<=100&&unique(c.items)&&c.items.every(i=>i&&Object.keys(i).every(k=>['id','label','done'].includes(k))&&id(i.id)&&text(i.label,150)&&typeof i.done==='boolean'));
}
async function readBody(request,limit){
 const reader=request.body?.getReader();if(!reader)throw {status:400,error:'Tom begäran'};
 const chunks=[];let size=0;
 for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw {status:413,error:'För mycket data'};}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw {status:400,error:'Ogiltig data'};}
}
export function createEquipmentHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env),readPerson}={}){
 return async request=>{
  const url=new URL(request.url),isCard=url.pathname==='/api/person-card';
  if(!isCard&&url.pathname!=='/api/equipment')return reply(404,{ok:false,error:'Okänd adress'});
  if(!['GET','PUT'].includes(request.method))return reply(405,{ok:false,error:'Otillåten metod'});
  const teams=url.searchParams.getAll('team_id');
  if(teams.length!==1||!personId(teams[0]))return reply(400,{ok:false,error:'Välj ett lag'});
  const kinds=url.searchParams.getAll('kind'),ids=url.searchParams.getAll('person_id');
  if(isCard&&(kinds.length!==1||!['player','coach'].includes(kinds[0])||ids.length!==1||!personId(ids[0])))return reply(400,{ok:false,error:'Ogiltig person'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return reply(401,{ok:false,error:'Logga in först'});
  try{
   const actor=await verifyIdentity(token);
   if(!actor)return reply(401,{ok:false,error:'Logga in igen'});
   const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   const membership=access.memberships.find(m=>m.team_id===teams[0]);
   if(!membership||!access.permissions.includes('read'))return reply(403,{ok:false,error:'Ingen åtkomst till laget'});
   const canWrite=['owner','team_admin','coach','equipment','team_manager'].includes(membership.role);
   const canEditProfile=authorizeTeamFeature(access,teams[0],'roster').allowed;
   const canEditSkates=canEditProfile||membership.role==='equipment';
   if(request.method==='PUT'&&!(isCard?canEditSkates:canWrite))return reply(403,{ok:false,error:'Saknar behörighet att ändra'});
   // Validate the body before accessing material storage.
   const data=request.method==='PUT'?await readBody(request,isCard?8000:200000):null;
   if(data&&(isCard?(!Number.isSafeInteger(data.revision)||data.revision<0||Object.keys(data).some(k=>!['revision','card'].includes(k))||!validatePersonCard(data.card)):!validateEquipmentBoard(data)))return reply(400,{ok:false,error:'Kontrollera uppgifterna'});
   if(request.method==='PUT'&&!data)return reply(400,{ok:false,error:'Kontrollera uppgifterna'});
   let person;
   if(isCard){
    if(typeof readPerson!=='function')return reply(503,{ok:false,error:'Truppkopplingen saknas'});
    person=await readPerson(teams[0],kinds[0],ids[0]);
    if(!person)return reply(404,{ok:false,error:'Personen finns inte i valt lag'});
   }
   const db=env.AUTH_DB;
   const row=await db.prepare('SELECT board_json,revision FROM equipment_boards WHERE team_id=?').bind(teams[0]).first();
   const saved=row?JSON.parse(row.board_json):{requests:[],checklists:[]};
   const revision=row?.revision||0;
   const profiles=saved.profiles||{};
   const key=isCard?kinds[0]+':'+ids[0]:null;
   const card=isCard?{...emptyPersonCard(),...profiles[key]}:null;
   if(request.method==='GET')return reply(200,isCard?{ok:true,name:person.name,card,revision,canEditProfile,canEditSkates,canRequest:canWrite}:{ok:true,canWrite,requests:saved.requests,checklists:saved.checklists,revision});
   if(data.revision!==revision)return reply(409,{ok:false,error:'Någon annan har ändrat. Ladda om innan du försöker igen.'});
   let next;
   if(isCard){
    if(!canEditProfile&&['number','position','hand'].some(k=>data.card[k]!==card[k]))return reply(403,{ok:false,error:'Du får endast ändra skridskouppgifterna'});
    if(!Object.hasOwn(profiles,key)&&Object.keys(profiles).length>=500)return reply(400,{ok:false,error:'För många personkort'});
    next={...saved,profiles:{...profiles,[key]:data.card}};
   }else{
    const requests=[];
    for(const item of data.requests){
     const old=saved.requests.find(r=>r.id===item.id&&r.kind===item.kind&&r.personId===item.personId);
     if(old){requests.push({...item,name:old.name,...(old.skates?{skates:old.skates}:{skates:skatesFrom(profiles[item.kind+':'+item.personId])})});continue;}
     // A new slip order uses the team's trusted roster identity and saved skate settings.
     if(typeof readPerson!=='function')return reply(503,{ok:false,error:'Truppkopplingen saknas'});
     const target=await readPerson(teams[0],item.kind,item.personId);
     if(!target)return reply(400,{ok:false,error:'Personen finns inte i valt lag'});
     requests.push({...item,name:target.name,skates:skatesFrom(profiles[item.kind+':'+item.personId])});
    }
    next={requests,checklists:data.checklists,profiles};
   }
   const board=JSON.stringify(next);
   if(new TextEncoder().encode(board).byteLength>1000000)return reply(413,{ok:false,error:'För mycket materialdata. Rensa gamla önskemål.'});
   const result=revision===0
    ?await db.prepare('INSERT INTO equipment_boards (team_id,board_json,revision,updated_by) VALUES (?,?,1,?) ON CONFLICT(team_id) DO NOTHING').bind(teams[0],board,String(actor.user.id)).run()
    :await db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND revision=?').bind(board,String(actor.user.id),teams[0],revision).run();
   if(!result.meta?.changes)return reply(409,{ok:false,error:'Någon annan har ändrat. Ladda om innan du försöker igen.'});
   return reply(200,isCard?{ok:true,card:data.card,revision:revision+1}:{ok:true,requests:next.requests,checklists:next.checklists,revision:revision+1});
  }catch(error){return reply(error.status||503,{ok:false,error:error.status?error.error:'Materialuppgifterna kunde inte hämtas eller sparas. Försök igen.'});}
 };
}
