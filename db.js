// NSK2 read-only Baserow adapter. No authentication and no write endpoints.
window.DB = (() => {
  const API = window.APP_CONFIG?.API_URL || 'https://nsk-api.peter-hasselberg.workers.dev';
  const failWrite = async () => { throw new Error('Sparande är tillfälligt avstängt i denna testversion.'); };
  const id = x => x == null ? null : Number(x);
  const linked = x => Array.isArray(x) ? x.map(v => Number(typeof v === 'object' ? v.id : v)).filter(Number.isFinite) : [];
  const first = x => linked(x)[0] ?? null;
  const num = (x,d=0) => Number.isFinite(Number(x)) && x !== '' && x != null ? Number(x) : d;
  async function rows(table) {
    let all=[],page=1;
    while (true) {
      const response=await fetch(`${API}/api/${table}?page=${page}&size=200`,{cache:'no-store'});
      if (!response.ok) throw new Error(`API-fel för ${table}: ${response.status}`);
      const data=await response.json();
      if (!data.ok || !Array.isArray(data.results)) throw new Error(`Ogiltigt API-svar för ${table}`);
      all.push(...data.results);
      if (!data.next) return all;
      if (++page > 100) throw new Error('För många sidor i API-svaret');
    }
  }
  const teamId=async()=>{const team=(await rows('lag')).find(r=>r.Namn==='NSK Team 18' && String(r['Säsong'])==='2026');if(!team)throw new Error('NSK Team 18 (2026) saknas');return team.id};
  async function listPlayers(){const t=await teamId();return (await rows('spelare')).filter(r=>linked(r.Lag).includes(t)).map(r=>({id:r.id,full_name:r.Namn,team_id:t})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'sv'))}
  async function listCoaches(){const t=await teamId();return (await rows('tranare')).filter(r=>linked(r.Lag).includes(t)).map(r=>({id:r.id,full_name:r.Namn,team_id:t})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'sv'))}
  async function listPools(){const t=await teamId();return (await rows('poolspel')).filter(r=>linked(r.Lag).includes(t)).map(r=>({id:r.id,team_id:t,title:r.Namn,place:r.Plats,pool_date:r.Datum,status:typeof r.Status==='object'?r.Status?.value:r.Status,teams:num(r['Antal lag']),matches:num(r['Antal matcher']),players_on_field:num(r['Spelare på plan']),periods:num(r.Perioder),period_time:num(r.Periodtid),sub_time:num(r.Bytestid)})).sort((a,b)=>String(b.pool_date||'').localeCompare(String(a.pool_date||'')))}
  async function getPool(poolId){return (await listPools()).find(r=>String(r.id)===String(poolId))||null}
  async function listPoolTeamMatchConfigs(poolId){return (await rows('matchkonfiguration')).filter(r=>first(r.Poolspel)==id(poolId)).map(r=>({id:r.id,pool_id:id(poolId),lag_no:num(r.Lagnummer,1),match_no:num(r.Matchnummer,1),start_time:r.Starttid||null,opponent:r.Motståndare||'',plan:r.Plan||'',player_count:num(r['Antal spelare']),goalie_player_id:first(r.Målvakt),players_on_field:linked(r['Spelare på plan'])})).sort((a,b)=>a.lag_no-b.lag_no||a.match_no-b.match_no)}
  async function getPoolTeamMatchConfig(poolId,lagNo,matchNo){return (await listPoolTeamMatchConfigs(poolId)).find(r=>r.lag_no==lagNo&&r.match_no==matchNo)||null}
  async function getPlayersOnField(poolId,lagNo,matchNo){const players=await listPlayers();const row=await getPoolTeamMatchConfig(poolId,lagNo,matchNo)||await getPoolTeamMatchConfig(poolId,lagNo,1);return row?.players_on_field?.length?players.filter(p=>row.players_on_field.includes(p.id)):players}
  async function getLineup(matchConfigId){return (await rows('laguppstallningar')).filter(r=>first(r.Matchkonfiguration)==id(matchConfigId)).map(r=>({id:r.id,pool_id:first(r.Poolspel),match_config_id:id(matchConfigId),person_type:typeof r.Persontyp==='object'?r.Persontyp?.value:r.Persontyp,person_id:num(r['Person-ID']),sort_order:num(r.Sorteringsordning)})).filter(r=>r.person_id).sort((a,b)=>a.sort_order-b.sort_order)}
  async function listUsedPlayersInPool(poolId,currentLagNo){const cfg=(await listPoolTeamMatchConfigs(poolId)).filter(r=>r.lag_no!=currentLagNo);const result=await Promise.all(cfg.map(c=>getLineup(c.id)));return [...new Set(result.flat().filter(r=>r.person_type==='player').map(r=>r.person_id))]}
  async function listShiftSchema(poolId,lagNo,matchNo){return (await rows('bytesschema')).filter(r=>first(r.Poolspel)==id(poolId)&&num(r.Lagnummer)==lagNo&&num(r.Matchnummer)==matchNo).map(r=>({id:r.id,pool_id:id(poolId),lag_no:num(r.Lagnummer),match_no:num(r.Matchnummer),shift_no:num(r.Bytenummer),period_no:num(r.Periodnummer),time_left:r['Tid kvar']||'',players_json:linked(r['Spelare på plan']),done:!!r.Genomfört})).sort((a,b)=>a.shift_no-b.shift_no)}
  async function listGoalieStats(){return (await rows('malvaktsstatistik')).map(r=>({id:r.id,goalie_name:r.Målvaktsnamn||'',match_id:r['Match-ID']||''}))}
  async function listPlayerCoachMap(){const [map,players,coaches]=await Promise.all([rows('spelaretranare'),listPlayers(),listCoaches()]);return map.map(r=>({id:r.id,player_name:players.find(p=>p.id===first(r.Spelare))?.full_name||'',coach_name:coaches.find(c=>c.id===first(r.Tränare))?.full_name||''})).filter(r=>r.player_name)}
  async function writePlayer(method, rowId, name){
    const token=localStorage.getItem('nsk_admin_token');
    if(!token)throw new Error('Aktivera Adminläge först.');
    const response=await fetch(`${API}/api/spelare${rowId?'/'+encodeURIComponent(rowId):''}`,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({name:String(name||'').trim()})});
    const result=await response.json();
    if(!response.ok)throw new Error(result.error||'Kunde inte spara spelare');
    return result.row;
  }
  const addPlayer=name=>writePlayer('POST',null,name);
  const updatePlayer=(rowId,name)=>writePlayer('PATCH',rowId,name);
  return {listPlayers,listCoaches,listPools,getPool,listPoolTeamMatchConfigs,getPoolTeamMatchConfig,getPlayersOnField,getLineup,listUsedPlayersInPool,listShiftSchema,listGoalieStats,listPlayerCoachMap,
  addPlayer,updatePlayer,deletePlayer:failWrite,addCoach:failWrite,updateCoach:failWrite,deleteCoach:failWrite,addPool:failWrite,updatePool:failWrite,deletePool:failWrite,savePoolTeamMatchConfig:failWrite,saveLineup:failWrite,saveShiftSchema:failWrite,deleteShiftSchema:failWrite,setShiftDone:failWrite,savePlayerCoachMap:failWrite,subscribeTruppen:async()=>({unsubscribe(){}})};
})();
