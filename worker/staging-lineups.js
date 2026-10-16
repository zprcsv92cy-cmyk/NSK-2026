import { authorizeTeamFeature } from './team-authorization-policy.js';
// Isolated test database only. All reads and writes are scoped to the selected team.
export async function stagingLineups(request,db,actor,json){
 if(!actor)return json({error:'Inte inloggad'},401);
 const url=new URL(request.url),teamId=url.searchParams.get('team_id');
 if(!teamId||teamId.length>100)return json({error:'Välj ett giltigt lag'},400);
 const membership=Array.isArray(actor.memberships) ? actor.memberships.find(x=>x && x.team_id===teamId) : null;
 if(!membership)return json({error:'Saknar lagmedlemskap'},403);
 const canEdit=authorizeTeamFeature(actor,teamId,'lineup').allowed;
 if(request.method==='GET'){
  const result=await db.prepare('SELECT l.id,l.match_name,l.goalie_id,l.player_ids,l.coach_ids,l.created_at,d.match_date,d.opponent,d.start_time,d.gathering_time,p.positions_json,u.units_json FROM auth_lineups_staging l LEFT JOIN auth_lineup_match_details_staging d ON d.lineup_id=l.id AND d.team_id=l.team_id LEFT JOIN auth_lineup_positions_staging p ON p.lineup_id=l.id AND p.team_id=l.team_id LEFT JOIN auth_lineup_units_staging u ON u.lineup_id=l.id AND u.team_id=l.team_id WHERE l.team_id=? ORDER BY l.created_at DESC LIMIT 50').bind(teamId).all();
  return json({team_id:teamId,canEdit,lineups:(result.results||[]).map(x=>({id:x.id,match_name:x.match_name,goalie_id:x.goalie_id,player_ids:JSON.parse(x.player_ids),coach_ids:JSON.parse(x.coach_ids),created_at:x.created_at,match_date:x.match_date||'',opponent:x.opponent||'',start_time:x.start_time||'',gathering_time:x.gathering_time||'',positions:x.positions_json?JSON.parse(x.positions_json):{},units:x.units_json?JSON.parse(x.units_json):{}}))});
 }
 const lineupId=url.searchParams.get('id');
 if(request.method==='DELETE'){
  if(!canEdit)return json({error:'Saknar behörighet'},403);
  if(!lineupId||!/^[-a-f0-9]{36}$/.test(lineupId))return json({error:'Ogiltigt id'},400);
  const result=await db.prepare('DELETE FROM auth_lineups_staging WHERE id=? AND team_id=?').bind(lineupId,teamId).run();
  if(result.meta?.changes){await db.prepare('DELETE FROM auth_lineup_match_details_staging WHERE lineup_id=? AND team_id=?').bind(lineupId,teamId).run();await db.prepare('DELETE FROM auth_lineup_positions_staging WHERE lineup_id=? AND team_id=?').bind(lineupId,teamId).run();await db.prepare('DELETE FROM auth_lineup_units_staging WHERE lineup_id=? AND team_id=?').bind(lineupId,teamId).run();}
  return result.meta?.changes?json({ok:true}):json({error:'Uppställningen hittades inte i laget'},404);
 }
 if(request.method!=='POST'&&request.method!=='PATCH')return json({error:'Metoden stöds inte'},405);
 if(request.method==='PATCH'&&(!lineupId||!/^[-a-f0-9]{36}$/.test(lineupId)))return json({error:'Ogiltigt id'},400);
 if(!canEdit)return json({error:'Saknar behörighet att spara laguppställning'},403);
 let data;try{data=await request.json()}catch{return json({error:'Ogiltig JSON'},400)}
 const matchName=String(data.match_name||'').trim();
 if(!matchName||matchName.length>100)return json({error:'Ange ett matchnamn (högst 100 tecken)'},400);
 const matchDate=String(data.match_date||'').trim(),opponent=String(data.opponent||'').trim(),startTime=String(data.start_time||'').trim(),gatheringTime=String(data.gathering_time||'').trim();
 if((matchDate&&!/^\d{4}-\d{2}-\d{2}$/.test(matchDate))||opponent.length>100||[startTime,gatheringTime].some(t=>t&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)))return json({error:'Ogiltig matchinformation'},400);
 const players=data.player_ids,coaches=data.coach_ids,goalie=data.goalie_id||null;
 if(!Array.isArray(players)||!Array.isArray(coaches)||players.length>100||coaches.length>30||[...players,...coaches,...(goalie?[goalie]:[])].some(id=>typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id)))return json({error:'Ogiltigt spelarval'},400);
 if(new Set(players).size!==players.length||new Set(coaches).size!==coaches.length)return json({error:'Dubbla deltagare'},400);
 const positions=data.positions||{};
 if(!positions||typeof positions!=='object'||Array.isArray(positions)||Object.keys(positions).length>100||Object.entries(positions).some(([id,pos])=>!players.includes(id)||!['back','forward'].includes(pos))||(goalie&&players.includes(goalie)))return json({error:'Ogiltiga positioner eller målvakt vald även som utespelare'},400);
 const units=data.units||{};
 if(!units||typeof units!=='object'||Array.isArray(units)||Object.keys(units).length>100||Object.entries(units).some(([id,unit])=>!players.includes(id)||!(positions[id]==='back'?['back1','back2','back3','reserve'].includes(unit):positions[id]==='forward'?['line1','line2','line3','reserve'].includes(unit):false)))return json({error:'Ogiltiga kedjor, backpar eller reserver'},400);
 for(const [unit,max] of [['back1',2],['back2',2],['back3',2],['line1',3],['line2',3],['line3',3]])if(Object.values(units).filter(x=>x===unit).length>max)return json({error:'För många spelare i '+unit},400);
 const ids=[...new Set([...players,...coaches,...(goalie?[goalie]:[])])];
 if(ids.length){
  const placeholders=ids.map(()=>'?').join(',');
  const found=await db.prepare('SELECT id,kind FROM auth_roster_staging WHERE team_id=? AND id IN ('+placeholders+')').bind(teamId,...ids).all();
  const kinds=new Map((found.results||[]).map(x=>[x.id,x.kind]));
  if(players.some(id=>kinds.get(id)!=='player')||coaches.some(id=>kinds.get(id)!=='coach')||(goalie&&kinds.get(goalie)!=='player'))return json({error:'Spelare eller tränare tillhör inte laget'},400);
 }
 if(request.method==='PATCH'){
  const result=await db.prepare('UPDATE auth_lineups_staging SET match_name=?,goalie_id=?,player_ids=?,coach_ids=? WHERE id=? AND team_id=?').bind(matchName,goalie,JSON.stringify(players),JSON.stringify(coaches),lineupId,teamId).run();
  if(result.meta?.changes)await db.prepare('INSERT INTO auth_lineup_match_details_staging(lineup_id,team_id,match_date,opponent,start_time,gathering_time) VALUES(?,?,?,?,?,?) ON CONFLICT(lineup_id) DO UPDATE SET match_date=excluded.match_date,opponent=excluded.opponent,start_time=excluded.start_time,gathering_time=excluded.gathering_time WHERE team_id=excluded.team_id').bind(lineupId,teamId,matchDate,opponent,startTime,gatheringTime).run();
  if(result.meta?.changes)await db.prepare('INSERT INTO auth_lineup_positions_staging(lineup_id,team_id,positions_json) VALUES(?,?,?) ON CONFLICT(lineup_id) DO UPDATE SET positions_json=excluded.positions_json WHERE team_id=excluded.team_id').bind(lineupId,teamId,JSON.stringify(positions)).run();
  if(result.meta?.changes)await db.prepare('INSERT INTO auth_lineup_units_staging(lineup_id,team_id,units_json) VALUES(?,?,?) ON CONFLICT(lineup_id) DO UPDATE SET units_json=excluded.units_json WHERE team_id=excluded.team_id').bind(lineupId,teamId,JSON.stringify(units)).run();
  return result.meta?.changes?json({ok:true,id:lineupId}):json({error:'Uppställningen hittades inte i laget'},404);
 }
 const id=crypto.randomUUID();
 await db.prepare('INSERT INTO auth_lineups_staging(id,team_id,match_name,goalie_id,player_ids,coach_ids,created_by) VALUES(?,?,?,?,?,?,?)').bind(id,teamId,matchName,goalie,JSON.stringify(players),JSON.stringify(coaches),actor.user.id).run();
 await db.prepare('INSERT INTO auth_lineup_match_details_staging(lineup_id,team_id,match_date,opponent,start_time,gathering_time) VALUES(?,?,?,?,?,?)').bind(id,teamId,matchDate,opponent,startTime,gatheringTime).run();
 await db.prepare('INSERT INTO auth_lineup_positions_staging(lineup_id,team_id,positions_json) VALUES(?,?,?)').bind(id,teamId,JSON.stringify(positions)).run();
 await db.prepare('INSERT INTO auth_lineup_units_staging(lineup_id,team_id,units_json) VALUES(?,?,?)').bind(id,teamId,JSON.stringify(units)).run();
 return json({ok:true,id},201);
}
