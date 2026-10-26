// Additional primary-administrator PIN gate. Never stores the PIN or unlock secrets in plaintext.
const pinReply=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization, X-NSK-Skills-Unlock','X-Content-Type-Options':'nosniff'}});
const pinBytes=s=>new TextEncoder().encode(s);
const pinHex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const pinUnhex=hex=>Uint8Array.from(hex.match(/../g),v=>parseInt(v,16));
const pinDigest=async value=>pinHex(await crypto.subtle.digest('SHA-256',pinBytes(value)));
async function pinKey(pin,salt){const key=await crypto.subtle.importKey('raw',pinBytes(pin),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:pinUnhex(salt),iterations:100000,hash:'SHA-256'},key,{name:'HMAC',hash:'SHA-256',length:256},false,['sign','verify']);}
async function pinBody(request){
 if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw {status:415};
 const reader=request.body?.getReader();if(!reader)throw {status:400};let size=0,text='';const decoder=new TextDecoder();
 for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024){await reader.cancel();throw {status:413};}text+=decoder.decode(chunk.value,{stream:true});}
 try{return JSON.parse(text+decoder.decode());}catch{throw {status:400};}
}
export async function skillsPinGate(env,request,sessionToken){
 const path=new URL(request.url).pathname,endpoint=path==='/api/skills/pin',db=env.AUTH_DB,now=Math.floor(Date.now()/1000),sessionHash=await pinDigest(sessionToken);
 if(endpoint){
  if(new URL(request.url).search)return pinReply(400,{ok:false,error:'Ogiltig adress'});
  if(!['GET','POST','DELETE'].includes(request.method))return pinReply(405,{ok:false,error:'Otillåten metod'});
  if(request.method==='DELETE'){await db.prepare('DELETE FROM private_skills_unlocks WHERE session_hash=?').bind(sessionHash).run();return pinReply(200,{ok:true});}
  const config=await db.prepare('SELECT salt,pin_hash,attempts,locked_until FROM private_skills_pin WHERE id=1').first();
  if(request.method==='GET')return pinReply(200,{ok:true,configured:!!config,retryAfter:Math.max(0,(config?.locked_until||0)-now)});
  const input=await pinBody(request);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','pin','confirmPin'].includes(k))||typeof input.pin!=='string'||!/^\d{4}$/.test(input.pin)||!['setup','unlock'].includes(input.action))return pinReply(400,{ok:false,error:'Ange exakt fyra siffror.'});
  if(input.action==='setup'){
   if(config)return pinReply(409,{ok:false,error:'En kod är redan vald. Lås upp med befintlig kod.'});
   if(input.confirmPin!==input.pin)return pinReply(400,{ok:false,error:'Koderna stämmer inte överens.'});
   const salt=pinHex(crypto.getRandomValues(new Uint8Array(16))),key=await pinKey(input.pin,salt),hash=pinHex(await crypto.subtle.sign('HMAC',key,pinBytes('nsk-skills-pin-v1')));
   const saved=await db.prepare('INSERT INTO private_skills_pin (id,salt,pin_hash,attempts,locked_until) VALUES (1,?,?,0,0) ON CONFLICT(id) DO NOTHING').bind(salt,hash).run();
   if(!saved.meta?.changes)return pinReply(409,{ok:false,error:'En kod är redan vald. Läs om sidan.'});
  }else{
   if(!config)return pinReply(409,{ok:false,error:'Välj en kod först.'});
   // Reserve each attempt atomically before hashing; parallel requests cannot bypass the budget.
   const attempt=await db.prepare('UPDATE private_skills_pin SET attempts=CASE WHEN attempts>=5 THEN 1 ELSE attempts+1 END,locked_until=CASE WHEN attempts=4 THEN ? ELSE 0 END WHERE id=1 AND locked_until<=? RETURNING attempts,locked_until').bind(now+900,now).first();
   if(!attempt)return pinReply(429,{ok:false,error:'För många försök. Vänta innan du försöker igen.',retryAfter:Math.max(1,config.locked_until-now)});
   const key=await pinKey(input.pin,config.salt),valid=await crypto.subtle.verify('HMAC',key,pinUnhex(config.pin_hash),pinBytes('nsk-skills-pin-v1'));
   if(!valid)return pinReply(attempt.attempts>=5?429:403,{ok:false,error:attempt.attempts>=5?'Fem felaktiga försök. Vänta 15 minuter.':'Fel kod. '+(5-attempt.attempts)+' försök kvar.',retryAfter:Math.max(0,attempt.locked_until-now)});
   await db.prepare('UPDATE private_skills_pin SET attempts=0,locked_until=0 WHERE id=1').run();
  }
  const unlock=pinHex(crypto.getRandomValues(new Uint8Array(32))),expiresAt=now+900;
  await db.batch([db.prepare('DELETE FROM private_skills_unlocks WHERE expires_at<=?').bind(now),db.prepare('INSERT INTO private_skills_unlocks (session_hash,grant_hash,expires_at) VALUES (?,?,?) ON CONFLICT(session_hash) DO UPDATE SET grant_hash=excluded.grant_hash,expires_at=excluded.expires_at').bind(sessionHash,await pinDigest(unlock),expiresAt)]);
  return pinReply(200,{ok:true,unlock,expiresAt});
 }
 const unlock=request.headers.get('X-NSK-Skills-Unlock')||'';
 if(!/^[a-f0-9]{64}$/.test(unlock))return pinReply(423,{ok:false,code:'pin_required',error:'Lås upp Specialfunktioner med din kod.'});
 const grant=await db.prepare('SELECT 1 AS valid FROM private_skills_unlocks WHERE session_hash=? AND grant_hash=? AND expires_at>?').bind(sessionHash,await pinDigest(unlock),now).first();
 return grant?null:pinReply(423,{ok:false,code:'pin_required',error:'Kodskyddet är låst. Ange koden igen.'});
}
