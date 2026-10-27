import {pairKey,pairLabel,pairSettings,pairEnabled,pairValid,pairSyncRequests} from './skate-pairs.js';
import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
const sharpReply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Authorization','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const sharpId=v=>typeof v==='string'&&/^[1-9][0-9]*$/.test(v)&&Number.isSafeInteger(Number(v));
const sharpDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
// Encrypt recoverable QR tokens with a separate deployment secret; never store plaintext.
async function sharpKey(env){
 const secret=env.SHARPENING_QR_ENCRYPTION_KEY;
 if(typeof secret!=='string'||!/^([a-f0-9]{64})$/.test(secret))throw {status:503,error:'QR-lagring är inte konfigurerad. Kontakta administratören.'};
 const bytes=Uint8Array.from(secret.match(/../g),x=>parseInt(x,16));
 return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function sharpSeal(env,token,team,person){
 const iv=crypto.getRandomValues(new Uint8Array(12)),key=await sharpKey(env);
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(team+':'+person)},key,new TextEncoder().encode(token));
 return Array.from(iv,b=>b.toString(16).padStart(2,'0')).join('')+':'+Array.from(new Uint8Array(encrypted),b=>b.toString(16).padStart(2,'0')).join('');
}
async function sharpUnseal(env,value,team,person){
 if(typeof value!=='string'||!/^([a-f0-9]{24}):([a-f0-9]+)$/.test(value))return null;
 try{
  const [iv,cipher]=value.split(':'),key=await sharpKey(env);
  const bytes=Uint8Array.from(cipher.match(/../g),x=>parseInt(x,16));
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(iv.match(/../g),x=>parseInt(x,16)),additionalData:new TextEncoder().encode(team+':'+person)},key,bytes);
  const token=new TextDecoder().decode(plain);return /^[a-f0-9]{64}$/.test(token)?token:null;
 }catch{return null;}
}
async function sharpBody(request){
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw {status:415,error:'JSON krävs'};
 const reader=request.body?.getReader();if(!reader)throw {status:400,error:'Ogiltig data'};
 const chunks=[];let length=0;for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>6000){await reader.cancel();throw {status:413,error:'För mycket data'};}chunks.push(part.value);}
 const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw {status:400,error:'Ogiltig data'};}
}
const sharpBoard=async(db,team)=>{const row=await db.prepare('SELECT board_json,revision FROM equipment_boards WHERE team_id=?').bind(team).first();return {revision:row?.revision||0,board:row?JSON.parse(row.board_json):{requests:[],checklists:[],profiles:{}}};};
const sharpStatus=(board,personId,pair='regular')=>board.requests.some(r=>r.kind==='player'&&r.personId===personId&&pairKey(r)===pair&&!r.done)?'pending':board.requests.some(r=>r.kind==='player'&&r.personId===personId&&pairKey(r)===pair&&r.done)?'done':'none';
const sharpHistory=async(db,team,personId,pair='regular')=>{
 const rows=await db.prepare('SELECT completed_at,hollow,profile FROM sharpening_history WHERE team_id=? AND person_id=? AND pair=? ORDER BY completed_at IS NULL,completed_at DESC,id DESC LIMIT 10').bind(team,personId,pair).all();
 const history=rows.results.map(row=>({completedAt:row.completed_at,hollow:row.hollow,profile:row.profile})),latest=history.find(row=>row.completedAt),next=latest?Date.parse(latest.completedAt)+14*86400000:null;
 return {history,noteRequired:next!==null&&Date.now()<next,nextRegularAt:next===null?null:new Date(next).toISOString(),historyHasUndated:history.some(row=>row.completedAt===null)};
};
const sharpPublic=async(db,link,person,board,revision)=>{
 const card=board.profiles?.['player:'+link.person_id]||{},pairs=[];
 for(const key of ['regular','goalie'])if(pairEnabled(card,key)){const log=await sharpHistory(db,link.team_id,link.person_id,key),settings=pairSettings(card,key),status=sharpStatus(board,link.person_id,key);pairs.push({key,label:pairLabel(key),settings:{model:settings.model,hollow:settings.hollow,profile:settings.profile,notes:settings.notes},status:status==='none'&&log.history.length?'done':status,...log});}
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
    const team=url.searchParams.getAll('team_id'),person=url.searchParams.getAll('person_id');if(team.length!==1||person.length!==1||!sharpId(team[0])||!sharpId(person[0])||[...url.searchParams.keys()].some(k=>!['team_id','person_id'].includes(k)))return sharpReply(400,{ok:false,error:'Välj lag och spelare'});
    const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams()),member=access.memberships.find(m=>m.team_id===team[0]);
    if(!member||!access.permissions.includes('read')||!(actor.is_primary_admin===true||member.role==='equipment'))return sharpReply(403,{ok:false,error:'Endast huvudadministratör eller lagets materialförvaltare får hantera länkar.'});
    if(!await readPerson(team[0],person[0]))return sharpReply(404,{ok:false,error:'Spelaren finns inte i valt lag'});
    const current=await db.prepare('SELECT mode,revision,token_hash,token_ciphertext FROM sharpening_links WHERE team_id=? AND person_id=?').bind(team[0],person[0]).first(),revision=current?.revision||0;
    if(request.method==='GET'){
     const token=current?.mode!=='off'&&current?.token_ciphertext?await sharpUnseal(env,current.token_ciphertext,team[0],person[0]):null;
     return sharpReply(200,{ok:true,mode:current?.mode||'off',revision,...(token&&await sharpDigest(token)===current.token_hash?{token}:{})});
    }
    const data=await sharpBody(request);if(Object.keys(data).some(k=>!['mode','revision'].includes(k))||!['parent','player','off'].includes(data.mode)||!Number.isSafeInteger(data.revision)||data.revision<0)return sharpReply(400,{ok:false,error:'Kontrollera uppgifterna'});
    if(data.revision!==revision)return sharpReply(409,{ok:false,error:'Länken har ändrats. Läs om innan du försöker igen.'});
    const token=data.mode==='off'?null:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),hash=token?await sharpDigest(token):null;
    const ciphertext=token?await sharpSeal(env,token,team[0],person[0]):null;
    const saved=revision===0?await db.prepare('INSERT INTO sharpening_links (team_id,person_id,mode,token_hash,token_ciphertext,revision,updated_by) VALUES (?,?,?,?,?,1,?) ON CONFLICT(team_id,person_id) DO NOTHING').bind(team[0],person[0],data.mode,hash,ciphertext,actor.user.id).run():await db.prepare('UPDATE sharpening_links SET mode=?,token_hash=?,token_ciphertext=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND person_id=? AND revision=?').bind(data.mode,hash,ciphertext,actor.user.id,team[0],person[0],revision).run();
    if(!saved.meta?.changes)return sharpReply(409,{ok:false,error:'Länken har ändrats. Läs om innan du försöker igen.'});
    return sharpReply(200,{ok:true,mode:data.mode,revision:revision+1,...(token?{token}:{})});
   }
   if(env.NSK_DISABLE_PUBLIC_SHARPENING==='true')return sharpReply(404,{ok:false,error:'Sidan är avstängd. Kontakta materialförvaltaren.'});
   if(url.search)return sharpReply(400,{ok:false,error:'Ogiltig adress'});
   const token=/^Sharpening ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return sharpReply(404,{ok:false,error:'Länken saknas eller gäller inte längre. Be om en ny länk.'});
   const hash=await sharpDigest(token),find=()=>db.prepare("SELECT team_id,person_id,mode,revision,next_request_at FROM sharpening_links WHERE token_hash=? AND mode IN ('parent','player')").bind(hash).first();let link=await find();
   if(!link)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Be om en ny länk.'});
   const person=await readPerson(link.team_id,link.person_id);if(!person)return sharpReply(404,{ok:false,error:'Länken gäller inte längre. Kontakta materialförvaltaren.'});
   const data=request.method!=='GET'?await sharpBody(request):null;
   if(request.method==='POST'&&(Object.keys(data).some(k=>!['note','pair'].includes(k))||typeof data.note!=='string'||data.note.length>300||data.pair!==undefined&&!['regular','goalie','both'].includes(data.pair)))return sharpReply(400,{ok:false,error:'Skriv högst 300 tecken.'});
   if(request.method==='PUT'&&(Object.keys(data).some(k=>!['revision','pair','settings'].includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0||!['regular','goalie'].includes(data.pair)||!pairValid(data.settings)||Object.hasOwn(data.settings,'radius')))return sharpReply(400,{ok:false,error:'Kontrollera skridskouppgifterna'});
   for(let attempt=0;attempt<3;attempt++){
    const {board,revision}=await sharpBoard(db,link.team_id),card=board.profiles?.['player:'+link.person_id]||{};
    if(request.method==='GET'){
     if(!await find())return sharpReply(404,{ok:false,error:'Länken gäller inte längre.'});
     return sharpReply(200,await sharpPublic(db,link,person,board,revision));
    }
    const keys=data.pair==='both'?['regular','goalie']:[data.pair||'regular'];
    if(keys.some(key=>!pairEnabled(card,key)))return sharpReply(400,{ok:false,error:'Skridskoparet är inte aktiverat på spelarkortet'});
    let next;
    if(request.method==='PUT'){
     if(data.revision!==revision)return sharpReply(409,{ok:false,error:'Uppgifterna har ändrats. Uppdatera sidan innan du sparar.'});
     const settings={...pairSettings(card,data.pair),...data.settings},updated=data.pair==='regular'?{...card,...settings}:{...card,goalie:settings};
     next={...board,profiles:{...board.profiles,['player:'+link.person_id]:updated},requests:pairSyncRequests(board.requests,'player',link.person_id,updated)};
    }else{
     const needed=keys.filter(key=>sharpStatus(board,link.person_id,key)!=='pending');
     if(!needed.length)return sharpReply(200,await sharpPublic(db,link,person,board,revision));
     for(const key of needed){const log=await sharpHistory(db,link.team_id,link.person_id,key);if(log.noteRequired&&!data.note.trim())return sharpReply(400,{ok:false,code:'message_required',error:pairLabel(key)+': Det har gått mindre än 14 dagar sedan senaste slipningen. Skriv ett meddelande om varför slipning behövs igen.',...log});}
     if(board.requests.length+needed.length>300)return sharpReply(409,{ok:false,error:'Listan är full. Kontakta materialförvaltaren.'});
     next={...board,requests:[...board.requests,...needed.map(key=>({id:crypto.randomUUID(),kind:'player',personId:link.person_id,pair:key,name:person.name,note:data.note.trim(),done:false,skates:pairSettings(card,key)}))]};
    }
    const encoded=JSON.stringify(next);if(new TextEncoder().encode(encoded).byteLength>1000000)return sharpReply(409,{ok:false,error:'För mycket data. Kontakta materialförvaltaren.'});
    const guard="EXISTS (SELECT 1 FROM sharpening_links WHERE team_id=? AND person_id=? AND token_hash=? AND revision=? AND mode IN ('parent','player'))",proof=[link.team_id,link.person_id,hash,link.revision];
    const write=revision===0?db.prepare('INSERT INTO equipment_boards (team_id,board_json,revision,updated_by) SELECT ?,?,1,? WHERE '+guard+' ON CONFLICT(team_id) DO NOTHING').bind(link.team_id,encoded,'sharpening-link:'+link.mode,...proof):db.prepare('UPDATE equipment_boards SET board_json=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND revision=? AND '+guard).bind(encoded,'sharpening-link:'+link.mode,link.team_id,revision,...proof);
    const results=await db.batch([write]);
    if(results[0].meta?.changes)return sharpReply(200,await sharpPublic(db,link,person,next,revision+1));
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
