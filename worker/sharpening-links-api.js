import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
const sharpReply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Authorization','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const sharpId=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v));
const sharpDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
async function sharpBody(request){
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw {status:415,error:'JSON krävs'};
 const reader=request.body?.getReader();if(!reader)throw {status:400,error:'Ogiltig data'};
 const chunks=[];let length=0;for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>2000){await reader.cancel();throw {status:413,error:'För mycket data'};}chunks.push(part.value);}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw {status:400,error:'Ogiltig data'};}
}
const sharpBoard=async(db,team)=>{const row=await db.prepare('SELECT board_json,revision FROM equipment_boards WHERE team_id=?').bind(team).first();return {revision:row?.revision||0,board:row?JSON.parse(row.board_json):{requests:[],checklists:[],profiles:{}}};};
const sharpStatus=(board,personId)=>board.requests.some(r=>r.kind==='player'&&r.personId===personId&&!r.done)?'pending':board.requests.some(r=>r.kind==='player'&&r.personId===personId&&r.done)?'done':'none';
const sharpPublic=(link,person,board)=>{const card=board.profiles?.['player:'+link.person_id]||{};return {ok:true,firstName:person.name.trim().split(/\s+/)[0].slice(0,80),number:card.number||'',mode:link.mode,hollow:card.hollow||'',profile:card.profile||'',status:sharpStatus(board,link.person_id)};};
export function createSharpeningHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env),readPerson}={}){
 return async request=>{
  const url=new URL(request.url),publicRoute=url.pathname==='/api/sharpening/public';
  if(!publicRoute&&url.pathname!=='/api/sharpening/link')return sharpReply(404,{ok:false,error:'Okänd adress'});
  if(!(publicRoute?['GET','POST']:['GET','PUT']).includes(request.method))return sharpReply(405,{ok:false,error:'Otillåten metod'});
  try{
   const db=env.AUTH_DB;
   if(!publicRoute){
    const session=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!session)return sharpReply(401,{ok:false,error:'Logga in först'});
    const actor=await verifyIdentity(session);if(!actor)return sharpReply(401,{ok:false,error:'Logga in igen'});
    const team=url.searchParams.getAll('team_id'),person=url.searchParams.getAll('person_id');if(team.length!==1||person.length!==1||!sharpId(team[0])||!sharpId(person[0])||[...url.searchParams.keys()].some(k=>!['team_id','person_id'].includes(k)))return sharpReply(400,{ok:false,error:'Välj lag och spelare'});
    const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams()),member=access.memberships.find(m=>m.team_id===team[0]);
    if(!member||!access.permissions.includes('read')||!(actor.is_primary_admin===true||member.role==='equipment'))return sharpReply(403,{ok:false,error:'Endast huvudadministratör eller lagets materialförvaltare får hantera länkar.'});
    if(!await readPerson(team[0],person[0]))return sharpReply(404,{ok:false,error:'Spelaren finns inte i valt lag'});
    const current=await db.prepare('SELECT mode,revision FROM sharpening_links WHERE team_id=? AND person_id=?').bind(team[0],person[0]).first(),revision=current?.revision||0;
    if(request.method==='GET')return sharpReply(200,{ok:true,mode:current?.mode||'off',revision});
    const data=await sharpBody(request);if(Object.keys(data).some(k=>!['mode','revision'].includes(k))||!['parent','player','off'].includes(data.mode)||!Number.isSafeInteger(data.revision)||data.revision<0)return sharpReply(400,{ok:false,error:'Kontrollera uppgifterna'});
    if(data.revision!==revision)return sharpReply(409,{ok:false,error:'Länken har ändrats. Läs om innan du försöker igen.'});
    const token=data.mode==='off'?null:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=token?await sharpDigest(token):null;
    const saved=revision===0?await db.prepare('INSERT INTO sharpening_links (team_id,person_id,mode,token_hash,revision,updated_by) VALUES (?,?,?,?,1,?) ON CONFLICT(team_id,person_id) DO NOTHING').bind(team[0],person[0],data.mode,hash,actor.user.id).run():await db.prepare('UPDATE sharpening_links SET mode=?,token_hash=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND person_id=? AND revision=?').bind(data.mode,hash,actor.user.id,team[0],person[0],revision).run();
    if(!saved.meta?.changes)return sharpReply(409,{ok:false,error:'Länken har ändrats. Läs om innan du försöker igen.'});
    return sharpReply(200,{ok:true,mode:data.mode,revision:revision+1,...(token?{token}:{})});
   }
   if(env.NSK_DISABLE_PUBLIC_SHARPENING==='true')return sharpReply(404,{ok:false,error:'Sidan är avstängd. Kontakta materialförvaltaren.'});
   if(url.search)return sharpReply(400,{ok:false,error:'Ogiltig adress'});
   const token=/^Sharpening ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return sharpReply(404,{ok:false,error:'Länken saknas eller gäller inte längre. Be om en ny länk.'});
   const hash=await sharpDigest(token),find=()=>db.prepare("SELECT team_id,person_id,mode,revision,next_request_at FROM sharpening_links WHERE token_hash=? AND mode IN ('parent','player')").bind(hash).first();let link=await find();
   if(!link)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Be om en ny länk.'});
   const person=await readPerson(link.team_id,link.person_id);if(!person)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Kontakta materialförvaltaren.'});
   const data=request.method==='POST'?await sharpBody(request):null;
   if(data&&(Object.keys(data).some(k=>k!=='note')||typeof data.note!=='string'||data.note.length>300))return sharpReply(400,{ok:false,error:'Skriv högst 300 tecken.'});
   for(let attempt=0;attempt<3;attempt++){
    const {board,revision}=await sharpBoard(db,link.team_id);
    if(request.method==='GET'||sharpStatus(board,link.person_id)==='pending'){
     if(!await find())return sharpReply(404,{ok:false,error:'Länken gäller inte längre.'});
     return sharpReply(200,sharpPublic(link,person,board));
    }
    const now=Math.floor(Date.now()/1000);if(link.next_request_at>now)return sharpReply(429,{ok:false,error:'Vänta några minuter innan du skickar ett nytt önskemål.',retryAfter:link.next_request_at-now});
    if(board.requests.length>=300)return sharpReply(409,{ok:false,error:'Listan är full. Kontakta materialförvaltaren.'});
    const id=crypto.randomUUID(),card=board.profiles?.['player:'+link.person_id]||{},skates=Object.fromEntries(['model','hollow','profile','radius','notes'].map(key=>[key,card[key]||'']));
    const next={...board,requests:[...board.requests,{id,kind:'player',personId:link.person_id,name:person.name,note:data.note.trim(),done:false,skates}]},encoded=JSON.stringify(next);
    if(new TextEncoder().encode(encoded).byteLength>1000000)return sharpReply(409,{ok:false,error:'Kontakta materialförvaltaren för att lämna önskemålet.'});
    const guard="EXISTS (SELECT 1 FROM sharpening_links WHERE team_id=? AND person_id=? AND token_hash=? AND revision=? AND mode IN ('parent','player') AND next_request_at<=?)",proof=[link.team_id,link.person_id,hash,link.revision,now];
    const write=revision===0?db.prepare('INSERT INTO equipment_boards (team_id,board_json,revision,updated_by) SELECT ?,?,1,? WHERE '+guard+' ON CONFLICT(team_id) DO NOTHING').bind(link.team_id,encoded,'sharpening-link:'+link.mode,...proof):db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND revision=? AND '+guard).bind(encoded,'sharpening-link:'+link.mode,link.team_id,revision,...proof);
    const results=await db.batch([write,db.prepare("UPDATE sharpening_links SET next_request_at=? WHERE team_id=? AND person_id=? AND token_hash=? AND revision=? AND EXISTS (SELECT 1 FROM equipment_boards WHERE team_id=? AND revision=? AND json_extract(board_json,'$.requests[#-1].id')=?)").bind(now+300,link.team_id,link.person_id,hash,link.revision,link.team_id,revision+1,id)]);
    if(results[0].meta?.changes)return sharpReply(200,sharpPublic(link,person,next));
    link=await find();if(!link)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Be om en ny länk.'});
   }
   return sharpReply(409,{ok:false,error:'Uppgifterna ändrades samtidigt. Försök igen.'});
  }catch(error){return sharpReply(error.status||503,{ok:false,error:error.error||'Slipningssidan kunde inte nås. Försök igen.'});}
 };
}
export async function readSharpeningPerson(env,table,team,id,fetcher=fetch){
 const response=await fetcher(`https://api.baserow.io/api/database/rows/table/${table}/${id}/?user_field_names=true`,{headers:{Authorization:'Token '+env.BASEROW_TOKEN},signal:AbortSignal.timeout(12000)});
 if(response.status===404)return null;if(!response.ok)throw Error('Roster unavailable');const row=await response.json();
 return typeof row.Namn==='string'&&row.Namn.trim()&&Array.isArray(row.Lag)&&row.Lag.some(t=>String(typeof t==='object'?t.id:t)===team)?{name:row.Namn.slice(0,150)}:null;
}
