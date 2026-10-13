import { issueActivationToken } from './account-activation.js';
const targetEmail = 'nsk-test@example.invalid';
export async function bootstrapTestAccount(request, env) {
  const response = (body,status) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
  if (request.method !== 'POST') return response({error:'Metod ej tillåten'},405);
  const expected = env.AUTH_BOOTSTRAP_SECRET;
  const provided = request.headers.get('X-NSK-Bootstrap-Secret');
  if (!expected || typeof expected !== 'string' || expected.length < 32 || !provided || provided.length !== expected.length) return response({error:'Åtkomst nekad'},403);
  const a = new TextEncoder().encode(provided), b = new TextEncoder().encode(expected);
  let diff=0; for(let i=0;i<a.length;i++) diff|=a[i]^b[i];
  if(diff!==0) return response({error:'Åtkomst nekad'},403);
  if(!env.AUTH_DB) return response({error:'Databasen saknas'},503);
  const db=env.AUTH_DB;
  const user=await db.prepare('SELECT id,disabled FROM auth_users WHERE email=?').bind(targetEmail).first();
  if(!user || !user.disabled) return response({error:'Testkontot är inte tillgängligt för aktivering'},409);
  const existing=await db.prepare('SELECT count(*) AS n FROM auth_setup_tokens WHERE user_id=?').bind(user.id).first();
  if(existing?.n) return response({error:'Aktiveringskod har redan utfärdats'},409);
  const result=await issueActivationToken(db,user.id);
  return response(result,result.status||200);
}
