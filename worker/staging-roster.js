import { authorizeTeamFeature } from './team-authorization-policy.js';
export async function stagingRoster(request,db,actor,json) {
 const url=new URL(request.url), path=url.pathname;
 if(!actor) return json({error:'Inte inloggad'},401);
 const teamValues=url.searchParams.getAll('team_id');
 if(teamValues.length!==1)return json({error:'Ange exakt ett lag'},400);
 const teamId=teamValues[0];
 if(!teamId || teamId.length>100 || teamId.trim()!==teamId) return json({error:'Välj ett giltigt lag'},400);
 if(!Array.isArray(actor.memberships) || !actor.memberships.some(m=>m && m.team_id===teamId)) return json({error:'Saknar lagmedlemskap'},403);
 // A personal grant alone never authorizes edits in another team.
 const canManage=authorizeTeamFeature(actor,teamId,'roster').allowed;
 // Validate the route before reading request bodies or touching storage.
 const isCollection=path==='/api/auth/roster-staging';
 const rowMatch=/^\/api\/auth\/roster-staging\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(path);
 if(!isCollection&&!rowMatch)return json({error:'Okänd begäran'},404);
 if(isCollection&&!['GET','POST'].includes(request.method))return json({error:'Metoden stöds inte'},405);
 if(rowMatch&&!['PATCH','DELETE'].includes(request.method))return json({error:'Metoden stöds inte'},405);
 if(path==='/api/auth/roster-staging'&&request.method==='GET'){
  const rows=await db.prepare('SELECT id,kind,name FROM auth_roster_staging WHERE team_id=? ORDER BY kind,name').bind(teamId).all();
  return json({rows:rows.results||[],canManage});
 }
 if(!['POST','PATCH','DELETE'].includes(request.method))return json({error:'Metoden stöds inte'},405);
 if(!canManage)return json({error:'Saknar behörighet att ändra Truppen'},403);
 let parsedWrite;
 if(['POST','PATCH'].includes(request.method)){
  const length=request.headers.get('Content-Length');
  if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>2048))return json({error:'Begäran är för stor'},413);
  // Read at most 2049 bytes from the original stream, even without Content-Length.
  // Do not clone/tee the body: a stalled second stream can buffer unbounded data.
  const reader=request.body?.getReader();
  if(!reader)return json({error:'Ogiltig JSON'},400);
  const chunks=[];
  let bytes=0;
  try{
   while(true){
    const {done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>2048){reader.cancel().catch(()=>{});return json({error:'Begäran är för stor'},413);}
    chunks.push(value);
   }
  }finally{reader.releaseLock();}
  const body=new Uint8Array(bytes);
  let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  try{parsedWrite=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}
  catch{return json({error:'Ogiltig JSON'},400);}
  if(!parsedWrite||typeof parsedWrite!=='object'||Array.isArray(parsedWrite))
   return json({error:'Ogiltig JSON'},400);
 }
 if(path==='/api/auth/roster-staging'&&request.method==='POST'){
  const data=parsedWrite;
  const kind=typeof data.kind==='string'?data.kind:'';
  const name=typeof data.name==='string'?data.name.trim():'';
  if(!['player','coach','team_manager','fitness','equipment'].includes(kind)||!name||name.length>120)return json({error:'Ogiltig roll eller namn'},400);
  const id=crypto.randomUUID();
  await db.prepare('INSERT INTO auth_roster_staging(id,team_id,kind,name) VALUES(?,?,?,?)').bind(id,teamId,kind,name).run();
  return json({ok:true,id},201);
 }
 const match=rowMatch;
 if(match&&request.method==='PATCH'){
  const data=parsedWrite;
  const name=typeof data.name==='string'?data.name.trim():'';
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
