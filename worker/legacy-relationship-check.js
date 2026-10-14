// Read-only compatibility check for NSK's existing numeric ID relationships.
// Pure data: no network calls, no production database access, no writes.
export function checkLegacyRelationships({players=[],coaches=[],configs=[],lineups=[],shifts=[]}){
 const playerIds=new Set(players.map(x=>Number(x.id)));
 const coachIds=new Set(coaches.map(x=>Number(x.id)));
 const configIds=new Set(configs.map(x=>Number(x.id)));
 const missing=[];
 const check=(kind,source,id,valid)=>{if(!Number.isSafeInteger(Number(id))||!valid.has(Number(id)))missing.push({kind,source,id})};
 for(const c of configs){
  if(c.goalie_player_id!=null)check('goalie','config:'+c.id,c.goalie_player_id,playerIds);
  for(const id of c.players_on_field||[])check('on_field','config:'+c.id,id,playerIds);
 }
 for(const l of lineups){
  check('match_config','lineup:'+l.id,l.match_config_id,configIds);
  if(l.person_type==='player')check('lineup_player','lineup:'+l.id,l.person_id,playerIds);
  else if(l.person_type==='coach')check('lineup_coach','lineup:'+l.id,l.person_id,coachIds);
  else missing.push({kind:'person_type',source:'lineup:'+l.id,id:l.person_type});
 }
 for(const shift of shifts){
  for(const id of shift.players_json||[])check('shift_player','shift:'+shift.id,id,playerIds);
 }
 return {ok:missing.length===0,missing,checked:{players:players.length,coaches:coaches.length,configs:configs.length,lineups:lineups.length,shifts:shifts.length}};
}
