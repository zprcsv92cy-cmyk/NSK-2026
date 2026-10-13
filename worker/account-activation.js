import { validActivationPassword, validActivationToken, ACTIVATION_TOKEN_LIFETIME_MINUTES } from './account-activation-validation.js';
const encode = text => new TextEncoder().encode(text);
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
const json = (value, status=200) => new Response(JSON.stringify(value), {status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256',encode(value))); }
function makeToken() { const b=crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...b)).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''); }
async function hashPassword(value) {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',encode(value),'PBKDF2',false,['deriveBits']);
  const rounds=600000;
  const derived=await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:rounds,hash:'SHA-256'},key,256);
  return 'pbkdf2-sha256$'+rounds+'$'+hex(salt)+'$'+hex(derived);
}
export async function handleActivation(request, env) {
  if (!env.AUTH_DB) return json({error:'Databasen saknas'},503);
  const path=new URL(request.url).pathname, db=env.AUTH_DB;
  if (path==='/api/auth/activate' && request.method==='POST') {
    let body;
    try {body=await request.json();} catch {return json({error:'Ogiltig JSON'},400);}
    if (!validActivationToken(body?.token) || !validActivationPassword(body?.password)) return json({error:'Ogiltig kod eller lösenord (minst 12 tecken)'},400);
    const hash=await digest(body.token);
    const row=await db.prepare("SELECT t.user_id FROM auth_setup_tokens t JOIN auth_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.used_at IS NULL AND t.expires_at>datetime('now') AND u.disabled=1").bind(hash).first();
    if (!row) return json({error:'Koden är ogiltig eller har gått ut'},400);
    const passwordHash=await hashPassword(body.password);
    const claim=await db.prepare("UPDATE auth_setup_tokens SET used_at=datetime('now') WHERE token_hash=? AND used_at IS NULL AND expires_at>datetime('now') RETURNING user_id").bind(hash).first();
    if (!claim) return json({error:'Koden har redan använts'},400);
    await db.prepare('UPDATE auth_users SET password_hash=?,disabled=0 WHERE id=? AND disabled=1').bind(passwordHash,claim.user_id).run();
    await db.prepare('DELETE FROM auth_setup_tokens WHERE user_id=?').bind(claim.user_id).run();
    return json({ok:true});
  }
  return json({error:'Okänd adress'},404);
}
export async function issueActivationToken(db,userId) {
  const user=await db.prepare('SELECT id,disabled FROM auth_users WHERE id=?').bind(userId).first();
  if (!user) return {error:'Användaren finns inte',status:404};
  if (!user.disabled) return {error:'Kontot är redan aktiverat',status:409};
  const token=makeToken();
  await db.batch([
    db.prepare('DELETE FROM auth_setup_tokens WHERE user_id=?').bind(userId),
    db.prepare("INSERT INTO auth_setup_tokens(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+120 minutes'))").bind(await digest(token),userId)
  ]);
  return {token,expires_in_minutes:ACTIVATION_TOKEN_LIFETIME_MINUTES};
}
