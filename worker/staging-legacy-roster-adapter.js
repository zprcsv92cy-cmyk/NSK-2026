import { authorizeTeamFeature } from './team-authorization-policy.js';
// Isolated staging adapter: legacy Truppen-shaped rows, backed ONLY by AUTH_DB test data.
// No production API, legacy admin token or production database is used.
export async function legacyRosterAdapter(request, db, actor, json) {
  if (!actor) return json({error:'Inte inloggad'},401);
  if (request.method !== 'GET') return json({error:'Skrivning via adaptern är inte aktiverad'},405);
  const url=new URL(request.url);
  const teamId=url.searchParams.get('team_id');
  if (!teamId || teamId.length>100) return json({error:'Välj ett giltigt lag'},400);
  const membership=actor.memberships.find(m=>m.team_id===teamId);
  if (!membership) return json({error:'Saknar lagmedlemskap'},403);
  const result=await db.prepare('SELECT id,kind,name FROM auth_roster_staging WHERE team_id=? ORDER BY kind,name').bind(teamId).all();
  const rows=result.results||[];
  const map=(kind)=>rows.filter(row=>row.kind===kind).map(row=>({id:row.id,full_name:row.name,team_id:teamId}));
  return json({
    team_id:teamId,
    canManage:authorizeTeamFeature(actor,teamId,'roster').allowed,
    players:map('player'),
    coaches:map('coach'),
    team_managers:map('team_manager'),
    fitness_staff:map('fitness'),
    equipment_staff:map('equipment')
  });
}
