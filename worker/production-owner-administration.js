// Global owner administration, read only until mutations receive separate audits.
// This production handler never trusts an email, browser role, or client-supplied user id.
import {verifyStagingSession} from './staging-session-identity.js';

const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleProductionOwnerAdministration(request,env){
  const path=new URL(request.url).pathname;
  if(!['/api/auth/users','/api/auth/team-members'].includes(path))return reply(404,{error:'Okänd adress'});
  if(request.method!=='GET')return reply(405,{error:'Metoden är inte tillåten'});
  if(!env?.AUTH_DB)return reply(503,{error:'Databasen är inte tillgänglig'});
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return reply(401,{error:'Personlig inloggning krävs'});
  try{
    const identity=await verifyStagingSession(token,env);
    if(!identity)return reply(401,{error:'Inloggningen är inte giltig'});
    if(!identity.memberships?.some(m=>m.team_id==='*'&&m.role==='owner')||
      !identity.permissions?.includes('users:manage'))
      return reply(403,{error:'Endast huvudadministratören kan läsa alla användare'});
    if(path==='/api/auth/users'){
      const [users,grants]=await Promise.all([
        env.AUTH_DB.prepare('SELECT id,email,display_name,disabled FROM auth_users ORDER BY display_name').all(),
        env.AUTH_DB.prepare('SELECT user_id,permission FROM auth_user_permissions').all()
      ]);
      if(!Array.isArray(users?.results)||!Array.isArray(grants?.results))throw Error('Invalid DB rows');
      return reply(200,{users:users.results.map(u=>({
        id:u.id,email:u.email,name:u.display_name,disabled:!!u.disabled,
        permissions:grants.results.filter(p=>p.user_id===u.id).map(p=>p.permission)
      }))});
    }
    const rows=await env.AUTH_DB.prepare(
      'SELECT user_id,team_id,role FROM auth_team_memberships ORDER BY team_id,role'
    ).all();
    if(!Array.isArray(rows?.results))throw Error('Invalid DB rows');
    return reply(200,{memberships:rows.results});
  }catch{return reply(503,{error:'Användarhanteringen kunde inte verifieras'});}
}
