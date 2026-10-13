// Isolated test database only. All reads and writes are scoped to the selected team.
export async function stagingLineups(request,db,actor,json){
 if(!actor)return json({error:'Inte inloggad'},401);
 const url=new URL(request.url),teamId=url.searchParams.get('team_id');
 if(!teamId||teamId.length>100)return json({error:'Välj ett giltigt lag'},400);
 const membership=actor.memberships.find(x=>x.team_id===teamId);
 if(!membership)return json({error:'Saknar lagmedlemskap'},403);
 const canEdit=membership.role==='team_admin'&&actor.permissions.includes('lineup:edit');
 if(request.method==='GET'){
  const result=await db.prepare('SELECT id,match_name,goalie_id,player_ids,coach_ids,created_at FROM auth_lineups_staging WHERE team_id=? ORDER BY created_at DESC LIMIT 50').bind(teamId).all();
  return json({team_id:teamId,canEdit,lineups:(result.results||[]).map(x=>({id:x.id,match_name:x.match_name,goalie_id:x.goalie_id,player_ids:JSON.parse(x.player_ids),coach_ids:JSON.parse(x.coach_ids),created_at:x.created_at}))});
 }
 if(request.method!=='POST')return json({error:'Metoden stöds inte'},405);
 if(!canEdit)return json({error:'Saknar behörighet att spara laguppställning'},403);
 let data;try{data=await request.json()}catch{return json({error:'Ogiltig JSON'},400)}
 const matchName=String(data.match_name||'').trim();
 if(!matchName||matchName.length>100)return json({error:'Ange ett matchnamn (högst 100 tecken)'},400);
 const players=data.player_ids,coaches=data.coach_ids,goalie=data.goalie_id||null;
 if(!Array.isArray(players)||!Array.isArray(coaches)||players.length>100||coaches.length>30||[...players,...coaches,...(goalie?[goalie]:[])].some(id=>typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id)))return json({error:'Ogiltigt spelarval'},400);
 if(new Set(players).size!==players.length||new Set(coaches).size!==coaches.length)return json({error:'Dubbla deltagare'},400);
 const ids=[...new Set([...players,...coaches,...(goalie?[goalie]:[])])];
 if(ids.length){
  const placeholders=ids.map(()=>'?').join(',');
  const found=await db.prepare('SELECT id,kind FROM auth_roster_staging WHERE team_id=? AND id IN ('+placeholders+')').bind(teamId,...ids).all();
  const kinds=new Map((found.results||[]).map(x=>[x.id,x.kind]));
  if(players.some(id=>kinds.get(id)!=='player')||coaches.some(id=>kinds.get(id)!=='coach')||(goalie&&kinds.get(goalie)!=='player'))return json({error:'Spelare eller tränare tillhör inte laget'},400);
 }
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO auth_lineups_staging(id,team_id,match_name,goalie_id,player_ids,coach_ids,created_by) VALUES(?,?,?,?,?,?,?)').bind(id,teamId,matchName,goalie,JSON.stringify(players),JSON.stringify(coaches),actor.user.id).run();
 return json({ok:true,id},201);
}
