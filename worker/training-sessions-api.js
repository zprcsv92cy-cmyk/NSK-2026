import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {validateTrainingPayload} from './training-session-validation.js';
import {authorizeTeamFeature} from './team-authorization-policy.js';

const fail=(status,error)=>Response.json({ok:false,error},{status,headers:{'cache-control':'no-store'}});
export function createTrainingHandler(env,listTeams){
 return async request=>{
  const url=new URL(request.url);
  if(url.pathname!=='/api/training')return fail(404,'Unknown route');
  if(!['GET','PUT'].includes(request.method))return fail(405,'Method not allowed');
  const team=url.searchParams.getAll('team_id');
  const dates=url.searchParams.getAll('date');
  if(team.length!==1||! /^[1-9][0-9]*$/.test(team[0])||dates.length>1||
    (dates.length===1&&!/^\d{4}-\d{2}-\d{2}$/.test(dates[0]))||
    (request.method==='PUT'&&dates.length!==1))return fail(400,'Invalid team or date');
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return fail(401,'Login required');
  if(!env.AUTH_DB||typeof listTeams!=='function')return fail(503,'Unavailable');
  try{
   const actor=await createPersonalRosterIdentityVerifier(env)(token);
   if(!actor)return fail(401,'Invalid session');
   const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   if(!access.memberships.some(m=>m.team_id===team[0])||!access.permissions.includes('read'))return fail(403,'No team access');
   const db=env.AUTH_DB;
   if(request.method==='GET'){
    if(!dates.length){
     const result=await db.prepare('SELECT training_date, selected_players_json, selected_coaches_json FROM training_sessions WHERE team_id=? ORDER BY training_date DESC LIMIT 500').bind(team[0]).all();
     return Response.json({ok:true,sessions:(result.results||[]).map(r=>({date:r.training_date,players:JSON.parse(r.selected_players_json).length,coaches:JSON.parse(r.selected_coaches_json).length}))});
    }
    const row=await db.prepare('SELECT * FROM training_sessions WHERE team_id=? AND training_date=?').bind(team[0],dates[0]).first();
    return Response.json({ok:true,session:row?{selected:JSON.parse(row.selected_players_json),selectedCoaches:JSON.parse(row.selected_coaches_json),goalies:JSON.parse(row.goalies_json),goalieCount:row.goalie_count,allocation:JSON.parse(row.allocation_json),revision:row.revision}:null});
   }
   if(!authorizeTeamFeature(access,team[0],'lineup').allowed)return fail(403,'Edit permission required');
   const raw=await request.text();
   if(raw.length>16000)return fail(413,'Too large');
   let data;try{data=JSON.parse(raw)}catch{return fail(400,'Invalid JSON')}
   if(!validateTrainingPayload(data))return fail(400,'Invalid training');
   const values=[JSON.stringify(data.selected),JSON.stringify(data.selectedCoaches),JSON.stringify(data.goalies),data.goalieCount,JSON.stringify(data.allocation),String(actor.user.id)];
   let result;
   if(data.revision===0){
    result=await db.prepare('INSERT INTO training_sessions (team_id,training_date,selected_players_json,selected_coaches_json,goalies_json,goalie_count,allocation_json,revision,updated_by) VALUES (?,?,?,?,?,?,?,1,?) ON CONFLICT(team_id,training_date) DO NOTHING')
      .bind(team[0],dates[0],...values).run();
   }else{
    result=await db.prepare('UPDATE training_sessions SET selected_players_json=?,selected_coaches_json=?,goalies_json=?,goalie_count=?,allocation_json=?,updated_by=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE team_id=? AND training_date=? AND revision=?')
      .bind(...values,team[0],dates[0],data.revision).run();
   }
   if(!result.meta?.changes)return fail(409,'Concurrent update');
   return Response.json({ok:true,revision:data.revision+1});
  }catch{return fail(503,'Training storage unavailable')}
 };
}
