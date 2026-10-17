// Production-only per-account login attempt limiter backed by AUTH_DB.
// Credentials are never stored; hashed email keys expire by 15-minute bucket.
const fail=(status,message)=>Response.json({error:message},{status,
  headers:{'cache-control':'no-store'}});
const MAX_ATTEMPTS=8;
const WINDOW_MS=15*60*1000;
async function emailHash(email){
  const bytes=new TextEncoder().encode(email);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function productionRateLimitedLogin(request,env,login){
  if(!env?.AUTH_DB)return fail(503,'Inloggning är inte tillgänglig');
  let data;
  try{data=await request.clone().json();}catch{return fail(400,'Ogiltig JSON');}
  if(!data||typeof data!=='object'||Array.isArray(data))
    return fail(400,'Ogiltiga inloggningsuppgifter');
  const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
  if(!email||email.length>254)return fail(401,'Fel e-postadress eller lösenord');
  const key=await emailHash(email);
  const windowStart=new Date(Math.floor(Date.now()/WINDOW_MS)*WINDOW_MS).toISOString();
  let count;
  try{
    const row=await env.AUTH_DB.prepare(
      'INSERT INTO auth_login_attempts(email_key,window_start,attempts) VALUES(?,?,1) '+
      'ON CONFLICT(email_key,window_start) DO UPDATE SET attempts=attempts+1 RETURNING attempts'
    ).bind(key,windowStart).first();
    count=Number(row?.attempts);
  }catch{return fail(503,'Inloggningen är tillfälligt otillgänglig');}
  if(!Number.isSafeInteger(count)||count>MAX_ATTEMPTS)
    return new Response(JSON.stringify({error:'För många inloggningsförsök. Försök igen senare.'}),{
      status:429,headers:{'content-type':'application/json','cache-control':'no-store','retry-after':'900'}});
  const response=await login(request,env);
  if(response.ok){
    try{
      await env.AUTH_DB.prepare('DELETE FROM auth_login_attempts WHERE email_key=? AND window_start=?')
        .bind(key,windowStart).run();
    }catch{
      // A valid login is still valid even if cleanup fails. No token is persisted here.
    }
  }
  return response;
}
