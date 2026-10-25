import {passwordHash,accountRateLimit} from './account-recovery.js';
import { validActivationPassword, validActivationToken, ACTIVATION_TOKEN_LIFETIME_MINUTES } from './account-activation-validation.js';
const encode = text => new TextEncoder().encode(text);
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256',encode(value))); }
function makeToken() { const b=crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).split('+').join('-').split('/').join('_').replace(/=+$/,''); }
export async function handleActivation(request, env) {
  if (!env.AUTH_DB) return json({error:'Databasen saknas'},503);
  const path=new URL(request.url).pathname, db=env.AUTH_DB;
  if (path==='/api/auth/activate' && request.method==='POST') {
    let body;
    try {body=await request.json();} catch {return json({error:'Ogiltig JSON'},400);}
    if (!validActivationToken(body?.token) || !validActivationPassword(body?.password)) return json({error:'Ogiltig kod eller lösenord (minst 12 tecken)'},400);
    if(!await accountRateLimit(db,'activate-ip:'+(request.headers.get('CF-Connecting-IP')||'unknown'),20))return json({error:'För många försök. Försök igen senare.'},429);
    let stage='hash-token';
    try {
    const hash=await digest(body.token);
    stage='find-token';
    const row=await db.prepare("SELECT t.user_id FROM auth_setup_tokens t JOIN auth_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>datetime('now') AND u.disabled=1").bind(hash).first();
    if (!row) return json({error:'Koden är ogiltig eller har gått ut'},400);
    stage='save-password';
    const updated=await db.batch([
     db.prepare("UPDATE auth_users SET password_hash=?,disabled=0 WHERE id=? AND disabled=1 AND password_hash='pending-setup' AND EXISTS (SELECT 1 FROM auth_setup_tokens WHERE token_hash=? AND user_id=? AND used_at IS NULL AND expires_at>datetime('now'))").bind(await passwordHash(body.password),row.user_id,hash,row.user_id),
     db.prepare("UPDATE auth_setup_tokens SET used_at=datetime('now') WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now')").bind(hash)
    ]);
    if(updated[0].meta?.changes!==1)return json({error:'Länken har redan använts eller kontot kan inte aktiveras'},400);
    return json({ok:true});
    } catch (err) {
      console.error('Activation failed',{stage});
      return json({error:'Aktiveringen kunde inte slutföras. Försök igen eller be om en ny länk.'},500);
    }
  }
  return json({error:'Okänd adress'},404);
}
export async function issueActivationToken(db,userId) {
  const user=await db.prepare('SELECT id,disabled,password_hash FROM auth_users WHERE id=?').bind(userId).first();
  if (!user) return {error:'Användaren finns inte',status:404};
  if(user.password_hash!=='pending-setup')return {error:'Ett befintligt konto aktiveras inte på nytt med en inbjudan. Använd återaktivering och lösenordsåterställning.',status:409};
  if (!user.disabled) return {error:'Kontot är redan aktiverat',status:409};
  const token=makeToken();
  await db.batch([
    db.prepare('DELETE FROM auth_setup_tokens WHERE user_id=?').bind(userId),
    db.prepare("INSERT INTO auth_setup_tokens(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+120 minutes'))").bind(await digest(token),userId)
  ]);
  return {token,purpose:'activate',expires_in_minutes:ACTIVATION_TOKEN_LIFETIME_MINUTES};
}
