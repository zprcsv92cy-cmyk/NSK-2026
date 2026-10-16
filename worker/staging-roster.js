import { authorizeTeamFeature } from './team-authorization-policy.js';
export async function stagingRoster(request,db,actor,json) {
 const url=new URL(request.url), path=url.pathname;
 if(!actor) return json({error:'Inte inloggad'},401);
 const teamId=url.searchParams.get('team_id');
 if(!teamId || teamId.length>100 || teamId.trim()!==teamId) return json({error:'Välj ett giltigt lag'},400);
 if(!Array.isArray(actor.memberships) || !actor.memberships.some(m=>m && m.team_id===teamId)) return json({error:'Saknar lagmedlemskap'},403);
 // A personal grant alone never authorizes edits in another team.
 const canManage=authorizeTeamFeature(actor,teamId,'roster').allowed;
 // Validate the route before reading request bodies or touching storage.
 const isCollection=path==='/api/auth/roster-staging';
 const rowMatch=/^\/api\/auth\/roster-staging\/([0-9a-f-]{36})$/.exec(path);
 if(!isCollection&&!rowMatch)return json({error:'Okänd begäran'},404);
 if(isCollection&&!['GET','POST'].includes(request.method))return json({error:'Metoden stöds inte'},405);
 if(rowMatch&&!['PATCH','DELETE'].includes(request.method))return json({error:'Metoden stöds inte'},405);
 if(path==='/api/auth/roster-staging'&&request.method==='GET'){
  const rows=await db.prepare('SELECT id,kind,name FROM auth_roster_staging WHERE team_id=? ORDER BY kind,name').bind(teamId).all();
  return json({rows:rows.results||[],canManage});
 }
 if(!['POST','PATCH','DELETE'].includes(request.method))return json({error:'Metoden stöds inte'},405);
 if(!canManage)return json({error:'Saknar behörighet att ändra Truppen'},403);
 if(path==='/api/auth/roster-staging'&&request.method==='POST'){
  let data;try{data=await request.json()}catch{return json({error:'Ogiltig JSON'},400)}
  const kind=String(data.kind||''),name=String(data.name||'').trim();
  if(!['player','coach','team_manager','fitness','equipment'].includes(kind)||!name||name.length>120)return json({error:'Ogiltig roll eller namn'},400);
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO auth_roster_staging(id,team_id,kind,name) VALUES(?,?,?,?)').bind(id,teamId,kind,name).run();
  return json({ok:true,id},201);
 }
 const match=rowMatch;
 if(match&&request.method==='PATCH'){
  let data;try{data=await request.json()}catch{return json({error:'Ogiltig JSON'},400)}
  const name=String(data.name||'').trim();
  if(!name||name.length>120)return json({error:'Ogiltigt namn'},400);
  const result=await db.prepare('UPDATE auth_roster_staging SET name=? WHERE id=? AND team_id=?').bind(name,match[1],teamId).run();
  return result.meta.changes?json({ok:true}):json({error:'Hittades inte'},404);
 }
 if(match&&request.method==='DELETE'){
  const result=await db.prepare('DELETE FROM auth_roster_staging WHERE id=? AND team_id=?').bind(match[1],teamId).run();
  return result.meta.changes?json({ok:true}):json({error:'Hittades inte'},404);
 }
 return json({error:'Okänd begäran'},404);
}
