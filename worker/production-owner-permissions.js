// Candidate-only personal permission management; the sole authority is AUTH_DB.
// Only a verified global owner can replace another non-owner user's grants.
import {verifyStagingSession} from './staging-session-identity.js';

const PERMISSIONS=new Set(['read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','users:manage']);
const reply=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleProductionOwnerPermissions(request,env){
  const match=/^\/api\/auth\/users\/([a-f0-9-]{36})\/permissions$/.exec(new URL(request.url).pathname);
  if(!match)return reply(404,{error:'Okänd adress'});
  if(request.method!=='PUT')return reply(405,{error:'Metoden är inte tillåten'});
  if(!env?.AUTH_DB)return reply(503,{error:'Databasen är inte tillgänglig'});
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return reply(401,{error:'Personlig inloggning krävs'});
  try{
    const actor=await verifyStagingSession(token,env);
    if(!actor)return reply(401,{error:'Inloggningen har upphört'});
    if(!actor.memberships?.some(m=>m.team_id==='*'&&m.role==='owner')||
       !actor.permissions?.includes('users:manage'))
      return reply(403,{error:'Endast huvudadministratören får ändra behörigheter'});
    const userId=match[1];
    if(userId===actor.user.id)return reply(403,{error:'Huvudadministratörens egna behörigheter är skyddade'});
    const target=await env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE id=?').bind(userId).first();
    if(!target)return reply(404,{error:'Användaren finns inte'});
    const owner=await env.AUTH_DB.prepare(
      "SELECT 1 AS protected FROM auth_team_memberships WHERE user_id=? AND team_id='*' AND role='owner'"
    ).bind(userId).first();
    if(owner)return reply(403,{error:'En huvudadministratörs behörigheter kan inte ändras'});
    const raw=await request.text();
    if(raw.length>2048)return reply(413,{error:'För stort underlag'});
    let body;
    try{body=JSON.parse(raw);}catch{return reply(400,{error:'Ogiltig JSON'});}
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).length!==1||!Object.hasOwn(body,'permissions')||
       !Array.isArray(body.permissions)||body.permissions.length>PERMISSIONS.size||
       body.permissions.some(p=>typeof p!=='string'||!PERMISSIONS.has(p))||
       new Set(body.permissions).size!==body.permissions.length)
      return reply(400,{error:'Ogiltiga behörigheter'});
    const statements=[
      env.AUTH_DB.prepare('DELETE FROM auth_user_permissions WHERE user_id=?').bind(userId),
      ...body.permissions.map(p=>env.AUTH_DB.prepare(
        'INSERT INTO auth_user_permissions(user_id,permission) VALUES(?,?)'
      ).bind(userId,p))
    ];
    const results=await env.AUTH_DB.batch(statements);
    if(!Array.isArray(results)||results.length!==statements.length||
       results.some(r=>r?.success===false))throw Error('D1 batch failure');
    return reply(200,{ok:true,user_id:userId,permissions:body.permissions});
  }catch{return reply(503,{error:'Behörighetsändringen kunde inte slutföras'});}
}
