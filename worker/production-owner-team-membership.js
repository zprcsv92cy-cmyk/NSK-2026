// Candidate-only team membership administration.
// Global owner may assign a regular team role to a verified season-2026 team.
// No endpoint here can create/change a global owner membership.
import {verifyStagingSession} from './staging-session-identity.js';
import {handlePersonalTeamList} from './production-personal-teams.js';

const ROLES=new Set(['team_admin','coach','team_manager','fitness','equipment','player','viewer']);
const reply=(status,data)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleProductionOwnerTeamMembership(request,env){
  if(new URL(request.url).pathname!=='/api/auth/team-members')return reply(404,{error:'Okänd adress'});
  if(!['PUT','DELETE'].includes(request.method))return reply(405,{error:'Metoden är inte tillåten'});
  if(!env?.AUTH_DB)return reply(503,{error:'Databasen är inte tillgänglig'});
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return reply(401,{error:'Personlig inloggning krävs'});
  try {
    const actor=await verifyStagingSession(token,env);
    if(!actor)return reply(401,{error:'Inloggningen är inte giltig'});
    if(!actor.memberships?.some(m=>m.team_id==='*'&&m.role==='owner')||
       !actor.permissions?.includes('users:manage'))
      return reply(403,{error:'Endast huvudadministratören får ändra lagmedlemskap'});
    const raw=await request.text();
    if(raw.length>2048)return reply(413,{error:'För stort underlag'});
    let body;
    try{body=JSON.parse(raw);}catch{return reply(400,{error:'Ogiltig JSON'});}
    const fields=request.method==='DELETE'?'team_id,user_id':'role,team_id,user_id';
    if(!body||typeof body!=='object'||Array.isArray(body)||
       Object.keys(body).sort().join(',')!==fields||
       typeof body.user_id!=='string'||! /^[a-f0-9-]{36}$/.test(body.user_id)||
       typeof body.team_id!=='string'||body.team_id.length>100||
       (request.method==='PUT'&&(typeof body.role!=='string'||!ROLES.has(body.role))))
      return reply(400,{error:'Ogiltig användare, lag eller roll'});
    if(body.user_id===actor.user.id)return reply(403,{error:'Huvudadministratörens medlemskap är skyddat'});
    const [user,protectedUser]=await Promise.all([
      env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE id=?').bind(body.user_id).first(),
      env.AUTH_DB.prepare(
        "SELECT 1 AS protected FROM auth_team_memberships WHERE user_id=? AND team_id='*' AND role='owner'"
      ).bind(body.user_id).first()
    ]);
    if(!user)return reply(404,{error:'Användaren finns inte'});
    if(protectedUser)return reply(403,{error:'Huvudadministratörens medlemskap är skyddat'});
    // Resolve the team against the trusted Baserow collection; user input alone
    // can never create arbitrary team IDs or a global '*' membership.
    const teamsResponse=await handlePersonalTeamList(new Request(
      new URL('/api/personal/lag',request.url),{
        headers:{Authorization:request.headers.get('Authorization')||''}
      }),env);
    if(!teamsResponse.ok)return reply(503,{error:'Lagregistret är inte tillgängligt'});
    const teams=await teamsResponse.json();
    const verified=(teams.results||[]).filter(t=>t.Namn===body.team_id);
    if(verified.length!==1)return reply(400,{error:'Laget är okänt eller tvetydigt'});
    if(request.method==='DELETE'){
      // A missing membership must not be reported as a successful removal.
      // Deletion targets an exact user/team pair and cannot touch the '*' owner grant.
      const deleted=await env.AUTH_DB.prepare(
        'DELETE FROM auth_team_memberships WHERE user_id=? AND team_id=? RETURNING user_id'
      ).bind(body.user_id,body.team_id).first();
      if(!deleted)return reply(404,{error:'Lagmedlemskapet finns inte'});
      return reply(200,{ok:true,user_id:body.user_id,team_id:body.team_id,removed:true});
    }
    const result=await env.AUTH_DB.prepare(
      'INSERT INTO auth_team_memberships(user_id,team_id,role) VALUES(?,?,?) '+
      'ON CONFLICT(user_id,team_id) DO UPDATE SET role=excluded.role'
    ).bind(body.user_id,body.team_id,body.role).run();
    if(result?.success===false)throw Error('Membership write failed');
    return reply(200,{ok:true,user_id:body.user_id,team_id:body.team_id,role:body.role});
  }catch{return reply(503,{error:'Lagmedlemskapet kunde inte sparas'});}
}
