// Global owner administration. New accounts stay disabled until separate secure activation.
// This production handler never trusts an email, browser role, or client-supplied user id.
import {verifyStagingSession} from './staging-session-identity.js';

const reply=(status,body)=>Response.json(body,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export async function handleProductionOwnerAdministration(request,env){
  const path=new URL(request.url).pathname;
  const userMatch=/^\/api\/auth\/users\/([a-f0-9-]{36})$/.exec(path);
  if(!['/api/auth/users','/api/auth/team-members'].includes(path)&&!userMatch)return reply(404,{error:'Okänd adress'});
  if(!(request.method==='GET'||(path==='/api/auth/users'&&request.method==='POST')||
    (userMatch&&['PATCH','DELETE'].includes(request.method))))
    return reply(405,{error:'Metoden är inte tillåten'});
  if(!env?.AUTH_DB)return reply(503,{error:'Databasen är inte tillgänglig'});
  const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return reply(401,{error:'Personlig inloggning krävs'});
  try{
    const identity=await verifyStagingSession(token,env);
    if(!identity)return reply(401,{error:'Inloggningen är inte giltig'});
    if(!identity.memberships?.some(m=>m.team_id==='*'&&m.role==='owner')||
      !identity.permissions?.includes('users:manage'))
      return reply(403,{error:'Endast huvudadministratören kan läsa alla användare'});
    if(userMatch){
      const userId=userMatch[1];
      if(userId===identity.user.id)return reply(403,{error:'Ditt eget konto kan inte ändras här'});
      const target=await env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE id=?').bind(userId).first();
      if(!target)return reply(404,{error:'Användaren finns inte'});
      // Protect every global owner, not only the current session.
      const owner=await env.AUTH_DB.prepare(
        "SELECT 1 AS protected FROM auth_team_memberships WHERE user_id=? AND team_id='*' AND role='owner'"
      ).bind(userId).first();
      if(owner)return reply(403,{error:'Huvudadministratören kan inte ändras eller tas bort'});
      if(request.method==='PATCH'){
        const raw=await request.text();
        if(raw.length>2048)return reply(413,{error:'För stort underlag'});
        let body;
        try{body=JSON.parse(raw);}catch{return reply(400,{error:'Ogiltig JSON'});}
        if(!body||typeof body!=='object'||Array.isArray(body)||
           Object.keys(body).sort().join(',')!=='email,name')
          return reply(400,{error:'Endast namn och e-postadress får ändras'});
        const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
        const name=typeof body.name==='string'?body.name.trim():'';
        if(email.length>254||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)||!name||name.length>150)
          return reply(400,{error:'Ogiltigt namn eller e-postadress'});
        const conflict=await env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE email=? AND id<>?')
          .bind(email,userId).first();
        if(conflict)return reply(409,{error:'E-postadressen används redan'});
        try{
          const updated=await env.AUTH_DB.prepare('UPDATE auth_users SET email=?,display_name=? WHERE id=?')
            .bind(email,name,userId).run();
          if(updated?.success===false)throw Error('Database rejected update');
        }catch(e){
          if(/unique|constraint/i.test(String(e)))return reply(409,{error:'E-postadressen används redan'});
          throw e;
        }
        return reply(200,{ok:true,id:userId,email,name});
      }
      const queries=[
        'DELETE FROM auth_sessions WHERE user_id=?',
        'DELETE FROM auth_setup_tokens WHERE user_id=?',
        'DELETE FROM auth_user_permissions WHERE user_id=?',
        'DELETE FROM auth_team_memberships WHERE user_id=?',
        'DELETE FROM auth_users WHERE id=?'
      ];
      const results=await env.AUTH_DB.batch(queries.map(sql=>env.AUTH_DB.prepare(sql).bind(userId)));
      if(!Array.isArray(results)||results.some(x=>x?.success===false))
        throw Error('Database delete failed');
      return reply(200,{ok:true});
    }
    if(path==='/api/auth/users'&&request.method==='POST'){
      if(Number(request.headers.get('Content-Length'))>2048)
        return reply(413,{error:'För stort underlag'});
      let body;
      try{const raw=await request.text();if(raw.length>2048)return reply(413,{error:'För stort underlag'});body=JSON.parse(raw);}
      catch{return reply(400,{error:'Ogiltig JSON'});}
      if(!body||typeof body!=='object'||Array.isArray(body)||
        Object.keys(body).some(key=>!['email','name'].includes(key)))
        return reply(400,{error:'Bara namn och e-postadress kan anges'});
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      const name=typeof body.name==='string'?body.name.trim():'';
      if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||
        !name||name.length>150)return reply(400,{error:'Ogiltigt namn eller e-postadress'});
      const existing=await env.AUTH_DB.prepare('SELECT id FROM auth_users WHERE email=?').bind(email).first();
      if(existing)return reply(409,{error:'E-postadressen används redan'});
      const id=crypto.randomUUID();
      try{
        const written=await env.AUTH_DB.prepare(
          'INSERT INTO auth_users(id,email,display_name,password_hash,disabled) VALUES(?,?,?,?,1)'
        ).bind(id,email,name,'pending-setup').run();
        if(written?.success===false)throw Error('Database rejected insert');
      }catch(e){
        // Treat constraint failures as conflict without exposing database details.
        if(/unique|constraint/i.test(String(e)))return reply(409,{error:'E-postadressen används redan'});
        throw e;
      }
      return reply(201,{id,email,name,disabled:true,permissions:[],setup_required:true});
    }
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
