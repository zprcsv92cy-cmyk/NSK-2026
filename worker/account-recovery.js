import {publicAppRoot} from './pages-migration.js';
import {validActivationPassword,validActivationToken} from './account-activation-validation.js';
const enc=new TextEncoder();
export const accountJson=(body,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function tokenDigest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export function accountToken(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function passwordHash(value){
 const salt=crypto.getRandomValues(new Uint8Array(16)),key=await crypto.subtle.importKey('raw',enc.encode(value),'PBKDF2',false,['deriveBits']);
 const bytes=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:100000,hash:'SHA-256'},key,256));
 const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
 return 'pbkdf2-sha256$100000$'+hex(salt)+'$'+hex(bytes);
}
export async function accountRateLimit(db,key,max){
 const window=new Date(Math.floor(Date.now()/900000)*900000).toISOString();
 const hash=await tokenDigest(key);
 const result=await db.prepare('INSERT INTO auth_account_rate_limits(rate_key,window_start,attempts) VALUES(?,?,1) ON CONFLICT(rate_key,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(hash,window).first();
 await db.prepare("DELETE FROM auth_account_rate_limits WHERE window_start<?").bind(new Date(Date.now()-86400000).toISOString()).run();
 return Number(result?.attempts)<=max;
}
export async function issuePasswordReset(db,userId){
 const user=await db.prepare('SELECT id,disabled FROM auth_users WHERE id=?').bind(userId).first();
 if(!user)return {error:'Användaren finns inte',status:404};
 if(user.disabled)return {error:'Kontot är inaktiverat. Aktivera ett nytt konto eller återaktivera ett befintligt konto först.',status:409};
 const token=accountToken();
 await db.batch([
  db.prepare('DELETE FROM auth_password_reset_tokens WHERE user_id=?').bind(userId),
  db.prepare("INSERT INTO auth_password_reset_tokens(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+30 minutes'))").bind(await tokenDigest(token),userId),
  db.prepare("UPDATE auth_recovery_requests SET handled_at=datetime('now') WHERE user_id=?").bind(userId)
 ]);
 return {token,purpose:'reset',expires_in_minutes:30};
}
export function accountEmailEnabled(env){return !!env.ACCOUNT_EMAIL&&typeof env.ACCOUNT_EMAIL.send==='function'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ACCOUNT_EMAIL_FROM||'');}
export async function sendAccountLink(env,user,result){
 if(!accountEmailEnabled(env))throw Error('E-postutskick är inte konfigurerat. Skapa en länk för säker delning i stället.');
 const link=publicAppRoot(env)+'aktivera/#'+new URLSearchParams({token:result.token,purpose:result.purpose||'activate'});
 const title=result.purpose==='reset'?'Återställ ditt NSK-lösenord':'Aktivera ditt NSK-konto';
 // Recipient is read from the account, never supplied in an administrator's delivery request.
 await env.ACCOUNT_EMAIL.send({from:{email:env.ACCOUNT_EMAIL_FROM,name:'NSK'},to:user.email,subject:title,text:title+'\n\nÖppna länken och välj ditt eget lösenord:\n'+link+'\n\nLänken gäller i '+result.expires_in_minutes+' minuter och kan användas en gång. Om du inte väntar på detta meddelande kan du ignorera det.'});
}
export async function handleAccountRecovery(request,env){
 const db=env.AUTH_DB,path=new URL(request.url).pathname;
 if(!db)return accountJson({error:'Kontotjänsten är inte tillgänglig'},503);
 if(path==='/api/auth/account-options'&&request.method==='GET')return accountJson({email_delivery:accountEmailEnabled(env)});
 if(path==='/api/auth/forgot-password'&&request.method==='POST'){
  let body;try{body=await request.json();}catch{return accountJson({error:'Ogiltig begäran'},400);}
  const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return accountJson({error:'Ange en giltig e-postadress'},400);
  const generic={ok:true,message:'Om adressen har ett aktivt konto har din begäran tagits emot. Kontakta huvudadministratören om du behöver hjälp.'};
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  const permitted=await accountRateLimit(db,'recover-ip:'+ip,20)&&await accountRateLimit(db,'recover-email:'+email,3);
  if(!permitted)return accountJson(generic,202);
  const user=await db.prepare('SELECT id,email,disabled FROM auth_users WHERE email=?').bind(email).first();
  if(user&&!user.disabled){
   await db.prepare("INSERT INTO auth_recovery_requests(user_id,requested_at,handled_at) VALUES(?,datetime('now'),NULL) ON CONFLICT(user_id) DO UPDATE SET requested_at=datetime('now'),handled_at=NULL").bind(user.id).run();
   if(accountEmailEnabled(env)){
    const result=await issuePasswordReset(db,user.id);
    try{await sendAccountLink(env,user,result);}catch{
     // Leave a visible request for administrator assistance without exposing delivery failures publicly.
     await db.prepare('UPDATE auth_recovery_requests SET handled_at=NULL WHERE user_id=?').bind(user.id).run();
    }
   }
  }
  return accountJson(generic,202);
 }
 if(path==='/api/auth/reset-password'&&request.method==='POST'){
  let body;try{body=await request.json();}catch{return accountJson({error:'Ogiltig begäran'},400);}
  if(!validActivationToken(body?.token)||!validActivationPassword(body?.password))return accountJson({error:'Ogiltig länk eller lösenord. Använd minst 12 tecken.'},400);
  if(!await accountRateLimit(db,'reset-ip:'+(request.headers.get('CF-Connecting-IP')||'unknown'),20))return accountJson({error:'För många försök. Försök igen senare.'},429);
  const hash=await tokenDigest(body.token);
  const row=await db.prepare("SELECT t.user_id FROM auth_password_reset_tokens t JOIN auth_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>datetime('now') AND u.disabled=0").bind(hash).first();
  if(!row)return accountJson({error:'Länken är ogiltig, använd eller har gått ut. Begär en ny länk.'},400);
  const updated=await db.batch([
   db.prepare("UPDATE auth_users SET password_hash=? WHERE id=? AND disabled=0 AND EXISTS (SELECT 1 FROM auth_password_reset_tokens WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>datetime('now'))").bind(await passwordHash(body.password),row.user_id,hash,row.user_id),
   db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE user_id=? AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM auth_password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now'))").bind(row.user_id,hash),
   db.prepare("UPDATE auth_password_reset_tokens SET used_at=datetime('now') WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')").bind(hash)
  ]);
  if(updated[0].meta?.changes!==1)return accountJson({error:'Länken har redan använts. Begär en ny länk.'},400);
  return accountJson({ok:true,message:'Lösenordet är ändrat. Logga in med ditt nya lösenord.'});
 }
 return accountJson({error:'Okänd adress'},404);
}
