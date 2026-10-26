import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';

const reply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
const text=(v,n)=>typeof v==='string'&&v.trim().length>0&&v.length<=n;
const id=v=>typeof v==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(v);
export function validateEquipmentBoard(data){
 if(!data||Object.keys(data).some(k=>!['revision','requests','checklists'].includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0)return false;
 const unique=rows=>rows.every(r=>r&&typeof r==='object')&&new Set(rows.map(r=>r.id)).size===rows.length;
 return Array.isArray(data.requests)&&data.requests.length<=300&&unique(data.requests)&&data.requests.every(r=>r&&Object.keys(r).every(k=>['id','kind','personId','name','note','done'].includes(k))&&id(r.id)&&['player','coach'].includes(r.kind)&&/^[1-9][0-9]*$/.test(r.personId)&&text(r.name,150)&&typeof r.note==='string'&&r.note.length<=300&&typeof r.done==='boolean')&&
 Array.isArray(data.checklists)&&data.checklists.length<=30&&unique(data.checklists)&&data.checklists.every(c=>c&&Object.keys(c).every(k=>['id','title','items'].includes(k))&&id(c.id)&&text(c.title,100)&&Array.isArray(c.items)&&c.items.length<=100&&unique(c.items)&&c.items.every(i=>i&&Object.keys(i).every(k=>['id','label','done'].includes(k))&&id(i.id)&&text(i.label,150)&&typeof i.done==='boolean'));
}
export function createEquipmentHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env)}={}){
 return async request=>{
  if(!['GET','PUT'].includes(request.method))return reply(405,{ok:false,error:'Otillåten metod'});
  const url=new URL(request.url),teams=url.searchParams.getAll('team_id');
  if(teams.length!==1||! /^[1-9][0-9]*$/.test(teams[0]))return reply(400,{ok:false,error:'Välj ett lag'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return reply(401,{ok:false,error:'Logga in först'});
  try{
   const actor=await verifyIdentity(token);
   if(!actor)return reply(401,{ok:false,error:'Logga in igen'});
   const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   const membership=access.memberships.find(m=>m.team_id===teams[0]);
   if(!membership||!access.permissions.includes('read'))return reply(403,{ok:false,error:'Ingen åtkomst till laget'});
   const canWrite=['owner','team_admin','coach','equipment','team_manager'].includes(membership.role);
   if(request.method==='PUT'&&!canWrite)return reply(403,{ok:false,error:'Endast ledare och materialförvaltare får ändra'});
   const db=env.AUTH_DB;
   if(request.method==='GET'){
    const row=await db.prepare('SELECT board_json,revision FROM equipment_boards WHERE team_id=?').bind(teams[0]).first();
    return reply(200,{ok:true,canWrite,...(row?JSON.parse(row.board_json):{requests:[],checklists:[]}),revision:row?.revision||0});
   }
   // Bound the stream before decoding; no unbounded request.text().
   const reader=request.body?.getReader();if(!reader)return reply(400,{ok:false,error:'Tom begäran'});
   const chunks=[];let size=0;
   for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>200000){await reader.cancel();return reply(413,{ok:false,error:'För mycket materialdata'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   let data;try{data=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{ok:false,error:'Ogiltig data'});}
   if(!validateEquipmentBoard(data))return reply(400,{ok:false,error:'Kontrollera uppgifterna'});
   const board=JSON.stringify({requests:data.requests,checklists:data.checklists});
   const result=data.revision===0
    ?await db.prepare('INSERT INTO equipment_boards (team_id,board_json,revision,updated_by) VALUES (?,?,1,?) ON CONFLICT(team_id) DO NOTHING').bind(teams[0],board,String(actor.user.id)).run()
    :await db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND revision=?').bind(board,String(actor.user.id),teams[0],data.revision).run();
   if(!result.meta?.changes)return reply(409,{ok:false,error:'Någon annan har ändrat. Ladda om innan du försöker igen.'});
   return reply(200,{ok:true,revision:data.revision+1});
  }catch{return reply(503,{ok:false,error:'Materialuppgifterna kunde inte hämtas eller sparas. Försök igen.'});}
 };
}
