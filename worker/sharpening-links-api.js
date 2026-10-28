import {pairKey,pairLabel,pairSettings,pairEnabled,pairValid,pairSyncRequests} from './skate-pairs.js';
import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
const sharpReply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Authorization','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const sharpId=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v));
const sharpDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const sharpHex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const sharpBytes=hex=>new Uint8Array(hex.match(/../g).map(v=>parseInt(v,16)));
async function sharpQrKey(env){
 if(!/^[a-f0-9]{64}$/.test(env.NSK_QR_LINK_KEY||''))throw {status:503,error:'Säker QR-lagring är inte konfigurerad.'};
 return crypto.subtle.importKey('raw',sharpBytes(env.NSK_QR_LINK_KEY),'AES-GCM',false,['encrypt','decrypt']);
}
const sharpQrContext=(team,person,revision)=>new TextEncoder().encode(JSON.stringify([team,person,revision]));
async function sharpSeal(env,token,team,person,revision){
 const key=await sharpQrKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:sharpQrContext(team,person,revision)},key,new TextEncoder().encode(token));
 return 'v1.'+sharpHex(iv)+'.'+sharpHex(cipher);
}
async function sharpOpen(env,row,team,person){
 if(!row?.token_ciphertext||row.mode==='off')return null;
 const key=await sharpQrKey(env),parts=row.token_ciphertext.split('.');
 try{
  if(parts.length!==3||parts[0]!=='v1'||!/^[a-f0-9]{24}$/.test(parts[1])||!/^[a-f0-9]{160}$/.test(parts[2]))throw Error();
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:sharpBytes(parts[1]),additionalData:sharpQrContext(team,person,row.revision)},key,sharpBytes(parts[2]));
  const token=new TextDecoder().decode(plain);
  if(!/^[a-f0-9]{64}$/.test(token)||await sharpDigest(token)!==row.token_hash)throw Error();return token;
 }catch{throw {status:409,error:'QR-koden kunde inte verifieras. Förnya QR för personen.'};}
}
async function sharpBody(request){
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw {status:415,error:'JSON krävs'};
 const reader=request.body?.getReader();if(!reader)throw {status:400,error:'Ogiltig data'};
 const chunks=[];let length=0;for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>6000){await reader.cancel();throw {status:413,error:'För mycket data'};}chunks.push(part.value);}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw {status:400,error:'Ogiltig data'};}
}
const sharpBoard=async(db,team)=>{const row=await db.prepare('SELECT board_json,revision FROM equipment_boards WHERE team_id=?').bind(team).first();return {revision:row?.revision||0,board:row?JSON.parse(row.board_json):{requests:[],checklists:[],profiles:{}}};};
const sharpStatus=(board,personId,pair='regular',kind='player')=>board.requests.some(r=>r.kind===kind&&r.personId===personId&&pairKey(r)===pair&&!r.done)?'pending':board.requests.some(r=>r.kind===kind&&r.personId===personId&&pairKey(r)===pair&&r.done)?'done':'none';
const sharpHistory=async(db,team,personId,pair='regular')=>{
 const rows=await db.prepare('SELECT completed_at,hollow,profile FROM sharpening_history WHERE team_id=? AND person_id=? AND pair=? ORDER BY completed_at IS NULL,completed_at DESC,id DESC LIMIT 10').bind(team,personId,pair).all();
 const history=rows.results.map(row=>({completedAt:row.completed_at,hollow:row.hollow,profile:row.profile})),latest=history.find(row=>row.completedAt),next=latest?Date.parse(latest.completedAt)+14*86400000:null;
 return {history,noteRequired:next!==null&&Date.now()<next,nextRegularAt:next===null?null:new Date(next).toISOString(),historyHasUndated:history.some(row=>row.completedAt===null)};
};
const sharpPublic=async(db,link,person,board,revision)=>{
 const card=board.profiles?.[link.kind+':'+link.roster_id]||{},pairs=[];
 for(const key of ['regular','goalie'])if(pairEnabled(card,key)){const log=await sharpHistory(db,link.team_id,link.person_id,key),settings=pairSettings(card,key),status=sharpStatus(board,link.roster_id,key,link.kind);pairs.push({key,label:pairLabel(key),settings:{model:settings.model,hollow:settings.hollow,profile:settings.profile,notes:settings.notes},status:status==='none'&&log.history.length?'done':status,...log});}
 const first=pairs[0];return {ok:true,revision,firstName:person.name.trim().split(/\s+/)[0].slice(0,80),number:card.number||'',mode:link.mode,hollow:first.settings.hollow,profile:first.settings.profile,status:first.status,history:first.history,noteRequired:first.noteRequired,nextRegularAt:first.nextRegularAt,historyHasUndated:first.historyHasUndated,pairs};
};

export function createSharpeningHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env),readPerson}={}){
 return async request=>{
  const url=new URL(request.url),publicRoute=url.pathname==='/api/sharpening/public';
  if(!publicRoute&&url.pathname!=='/api/sharpening/link')return sharpReply(404,{ok:false,error:'Okänd adress'});
  if(!(publicRoute?['GET','POST','PUT']:['GET','PUT']).includes(request.method))return sharpReply(405,{ok:false,error:'Otillåten metod'});
  try{
   const db=env.AUTH_DB;
   if(!publicRoute){
    const session=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!session)return sharpReply(401,{ok:false,error:'Logga in först'});
    const actor=await verifyIdentity(session);if(!actor)return sharpReply(401,{ok:false,error:'Logga in igen'});
    const team=url.searchParams.getAll('team_id'),person=url.searchParams.getAll('person_id'),kinds=url.searchParams.getAll('kind'),kind=kinds.length?kinds[0]:'player';if(kinds.length>1||!['player','coach'].includes(kind)||!person.length&&kinds.length||team.length!==1||person.length>1||!sharpId(team[0])||person.length===1&&!sharpId(person[0])||[...url.searchParams.keys()].some(k=>!['team_id','person_id','kind'].includes(k)))return sharpReply(400,{ok:false,error:'Välj lag och person'});
    const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams()),member=access.memberships.find(m=>m.team_id===team[0]);
    if(!member||!access.permissions.includes('read')||!(actor.is_primary_admin===true||member.role==='equipment'))return sharpReply(403,{ok:false,error:'Endast huvudadministratör eller lagets materialförvaltare får hantera länkar.'});
    if(!person.length){
     if(request.method!=='GET')return sharpReply(400,{ok:false,error:'Välj en person'});
     const rows=await db.prepare('SELECT person_id,mode,revision,token_ciphertext IS NOT NULL AS recoverable FROM sharpening_links WHERE team_id=?').bind(team[0]).all();
     return sharpReply(200,{ok:true,links:rows.results.map(r=>({personId:r.person_id.replace(/^coach:/,''),kind:r.person_id.startsWith('coach:')?'coach':'player',mode:r.mode,revision:r.revision,recoverable:r.mode!=='off'&&!!r.recoverable}))});
    }
    const storedPerson=kind==='coach'?'coach:'+person[0]:person[0];
    if(!await readPerson(team[0],person[0],kind))return sharpReply(404,{ok:false,error:'Personen finns inte i valt lag'});
    const current=await db.prepare('SELECT mode,revision,token_hash,token_ciphertext FROM sharpening_links WHERE team_id=? AND person_id=?').bind(team[0],storedPerson).first(),revision=current?.revision||0;
    if(request.method==='GET'){
     const token=await sharpOpen(env,current,team[0],storedPerson);
     return sharpReply(200,{ok:true,mode:current?.mode||'off',revision,recoverable:!!token,...(token?{token}:{})});
    }
    const data=await sharpBody(request),restore=data.action==='restore';
    if(Object.keys(data).some(k=>!(restore?['action','token','revision']:['action','mode','revision']).includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0||
      (restore?!/^[a-f0-9]{64}$/.test(data.token||''):!['parent','player','off'].includes(data.mode)||data.action!==undefined&&!['renew','mode'].includes(data.action)))return sharpReply(400,{ok:false,error:'Kontrollera uppgifterna'});
    if(data.revision!==revision)return sharpReply(409,{ok:false,error:'Länken har ändrats. Läs om innan du försöker igen.'});
    let token=null,hash=null,cipher=null,mode=restore?current?.mode:data.mode;
    if(restore){
     if(!current||current.mode==='off'||await sharpDigest(data.token)!==current.token_hash)return sharpReply(409,{ok:false,error:'Den sparade länken är inte längre aktiv. Den har inte importerats.'});
     token=data.token;hash=current.token_hash;
    }else if(mode!=='off'){
     if(data.action==='mode'&&current?.mode!=='off'&&current?.token_hash){token=await sharpOpen(env,current,team[0],storedPerson);hash=current.token_hash;}
     else{token=sharpHex(crypto.getRandomValues(new Uint8Array(32)));hash=await sharpDigest(token);}
    }
    if(token)cipher=await sharpSeal(env,token,team[0],storedPerson,revision+1);
    const saved=revision===0?await db.prepare('INSERT INTO sharpening_links (team_id,person_id,mode,token_hash,token_ciphertext,revision,updated_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(team_id,person_id) DO NOTHING').bind(team[0],storedPerson,mode,hash,cipher,actor.user.id).run():await db.prepare('UPDATE sharpening_links SET mode=?,token_hash=?,token_ciphertext=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND person_id=? AND revision=?').bind(mode,hash,cipher,actor.user.id,team[0],storedPerson,revision).run();
    if(!saved.meta?.changes)return sharpReply(409,{ok:false,error:'Länken har ändrats. Läs om innan du försöker igen.'});
    return sharpReply(200,{ok:true,mode,revision:revision+1,recoverable:!!token,...(token?{token}:{})});
   }
   if(env.NSK_DISABLE_PUBLIC_SHARPENING==='true')return sharpReply(404,{ok:false,error:'Sidan är avstängd. Kontakta materialförvaltaren.'});
   if(url.search)return sharpReply(400,{ok:false,error:'Ogiltig adress'});
   const token=/^Sharpening ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return sharpReply(404,{ok:false,error:'Länken saknas eller gäller inte längre. Be om en ny länk.'});
   const hash=await sharpDigest(token),find=()=>db.prepare("SELECT team_id,person_id,mode,revision,next_request_at FROM sharpening_links WHERE token_hash=? AND mode IN ('parent','player')").bind(hash).first();let link=await find();
   if(!link)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Be om en ny länk.'});
   const identify=()=>{link.kind=link.person_id.startsWith('coach:')?'coach':'player';link.roster_id=link.person_id.replace(/^coach:/,'');};identify();
   const person=await readPerson(link.team_id,link.roster_id,link.kind);if(!person)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Kontakta materialförvaltaren.'});
   const data=request.method!=='GET'?await sharpBody(request):null;
   if(request.method==='POST'&&(Object.keys(data).some(k=>!['note','pair'].includes(k))||typeof data.note!=='string'||data.note.length>300||data.pair!==undefined&&!['regular','goalie','both'].includes(data.pair)))return sharpReply(400,{ok:false,error:'Skriv högst 300 tecken.'});
   if(request.method==='PUT'&&(Object.keys(data).some(k=>!['revision','pair','settings'].includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0||!['regular','goalie'].includes(data.pair)||!pairValid(data.settings)||Object.hasOwn(data.settings,'radius')))return sharpReply(400,{ok:false,error:'Kontrollera skridskouppgifterna'});
   for(let attempt=0;attempt<3;attempt++){
    const {board,revision}=await sharpBoard(db,link.team_id),card=board.profiles?.[link.kind+':'+link.roster_id]||{};
    if(request.method==='GET'){
     if(!await find())return sharpReply(404,{ok:false,error:'Länken gäller inte längre.'});
     return sharpReply(200,await sharpPublic(db,link,person,board,revision));
    }
    const keys=data.pair==='both'?['regular','goalie']:[data.pair||'regular'];
    if(keys.some(key=>!pairEnabled(card,key)))return sharpReply(400,{ok:false,error:'Skridskoparet är inte aktiverat på personkortet'});
    let next;
    if(request.method==='PUT'){
     if(data.revision!==revision)return sharpReply(409,{ok:false,error:'Uppgifterna har ändrats. Uppdatera sidan innan du sparar.'});
     const settings={...pairSettings(card,data.pair),...data.settings},updated=data.pair==='regular'?{...card,...settings}:{...card,goalie:settings};
     next={...board,profiles:{...board.profiles,[link.kind+':'+link.roster_id]:updated},requests:pairSyncRequests(board.requests,link.kind,link.roster_id,updated)};
    }else{
     const needed=keys.filter(key=>sharpStatus(board,link.roster_id,key,link.kind)!=='pending');
     if(!needed.length)return sharpReply(200,await sharpPublic(db,link,person,board,revision));
     for(const key of needed){const log=await sharpHistory(db,link.team_id,link.person_id,key);if(log.noteRequired&&!data.note.trim())return sharpReply(400,{ok:false,code:'message_required',error:pairLabel(key)+': Det har gått mindre än 14 dagar sedan senaste slipningen. Skriv ett meddelande om varför slipning behövs igen.',...log});}
     if(board.requests.length+needed.length>300)return sharpReply(409,{ok:false,error:'Listan är full. Kontakta materialförvaltaren.'});
     next={...board,requests:[...board.requests,...needed.map(key=>({id:crypto.randomUUID(),kind:link.kind,personId:link.roster_id,pair:key,name:person.name,note:data.note.trim(),done:false,skates:pairSettings(card,key)}))]};
    }
    const encoded=JSON.stringify(next);if(new TextEncoder().encode(encoded).byteLength>1000000)return sharpReply(409,{ok:false,error:'För mycket data. Kontakta materialförvaltaren.'});
    const guard="EXISTS (SELECT 1 FROM sharpening_links WHERE team_id=? AND person_id=? AND token_hash=? AND revision=? AND mode IN ('parent','player'))",proof=[link.team_id,link.person_id,hash,link.revision];
    const write=revision===0?db.prepare('INSERT INTO equipment_boards (team_id,board_json,revision,updated_by) SELECT ?,?,1,? WHERE '+guard+' ON CONFLICT(team_id) DO NOTHING').bind(link.team_id,encoded,'sharpening-link:'+link.mode,...proof):db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND revision=? AND '+guard).bind(encoded,'sharpening-link:'+link.mode,link.team_id,revision,...proof);
    const results=await db.batch([write]);
    if(results[0].meta?.changes)return sharpReply(200,await sharpPublic(db,link,person,next,revision+1));
    link=await find();if(!link)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Be om en ny länk.'});identify();
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
