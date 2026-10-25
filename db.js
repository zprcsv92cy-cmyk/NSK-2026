// NSK-2026: Baserow adapter with separate match-code authorization.
window.DB = (() => {
  const API = window.APP_CONFIG?.API_URL || 'https://nsk-api.peter-hasselberg.workers.dev';
  const failWrite = async () => { throw new Error('Funktionen är ännu inte aktiverad.'); };
  const id = x => x == null ? null : Number(x);
  const linked = x => Array.isArray(x) ? x.map(v => Number(typeof v === 'object' ? v.id : v)).filter(Number.isFinite) : [];
  const first = x => linked(x)[0] ?? null;
  const num = (x,d=0) => Number.isFinite(Number(x)) && x !== '' && x != null ? Number(x) : d;
  const positive = x => Number.isSafeInteger(Number(x)) && Number(x) > 0;
  // Enabled only after the Worker and personal login are verified together.
  const scopedRosterEnabled = () => window.APP_CONFIG?.REQUIRE_SCOPED_ROSTER_READS === true;
  function rosterReadOptions(team) {
    if (!scopedRosterEnabled()) return { suffix: '', headers: {} };
    const token = window.Auth?.getToken?.();
    if (!token || !positive(team)) throw new Error('Personlig inloggning och lagval krävs för Truppen');
    return { suffix: '&team_id=' + encodeURIComponent(team), headers: { Authorization: 'Bearer ' + token } };
  }
  // Separate rollout flag: requires the matching Worker routes to be deployed first.
  // Disabled by default to preserve current production behavior.
  const scopedCollectionsEnabled = () => window.APP_CONFIG?.REQUIRE_SCOPED_COLLECTION_READS === true;
  const scopedCollectionTables = new Set(['poolspel','matchkonfiguration','laguppstallningar','bytesschema','spelaretranare']);
  function collectionReadOptions(table, team) {
    if (!scopedCollectionsEnabled() || !scopedCollectionTables.has(table))
      return { suffix: '', headers: {} };
    const token = window.Auth?.getToken?.();
    if (!token || !positive(team))
      throw new Error('Personlig inloggning och lagval krävs för poolspel och matcher');
    return { suffix: '&team_id=' + encodeURIComponent(team),
      headers: { Authorization: 'Bearer ' + token } };
  }
  async function rows(table, team = null, personalTeamRead = false) {
    let all=[],page=1;
    const scoped = personalTeamRead && (
      scopedRosterEnabled() || scopedCollectionsEnabled() ||
      window.APP_CONFIG?.REQUIRE_SCOPED_TEAM_READS === true
    )
      ? (() => {
          const token = window.Auth?.getToken?.();
          if (!token) throw new Error('Personlig inloggning krävs för laghämtning');
          return { suffix: '', headers: { Authorization: 'Bearer ' + token } };
        })()
      : ['spelare','tranare'].includes(table)
        ? rosterReadOptions(team)
        : collectionReadOptions(table, team);
    while (true) {
      const response=await fetch(`${API}/api/${table}?page=${page}&size=200${scoped.suffix}`,{cache:'no-store',headers:scoped.headers});
      if (!response.ok) throw new Error(`API-fel för ${table}: ${response.status}`);
      const data=await response.json();
      if (!data.ok || !Array.isArray(data.results)) throw new Error(`Ogiltigt API-svar för ${table}`);
      all.push(...data.results);
      if (!data.next) return all;
      if (++page > 100) throw new Error('För många sidor i API-svaret');
    }
  }
  const teamId=async()=>{const selected='NSK Team 18';if(!window.Auth?.getToken?.() && (scopedRosterEnabled() || scopedCollectionsEnabled() || window.APP_CONFIG?.REQUIRE_SCOPED_TEAM_READS === true))throw new Error('Personlig inloggning krävs för NSK Team 18');const matches=(await rows('lag', null, true)).filter(r=>r.Namn===selected && String(r['Säsong'])==='2026');if(matches.length!==1)throw new Error('Lagkopplingen kunde inte verifieras');return matches[0].id};
  async function listPlayers(){const t=await teamId();return (await rows('spelare',t)).filter(r=>linked(r.Lag).includes(t)).map(r=>({id:r.id,full_name:r.Namn,team_id:t})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'sv'))}
  async function listCoaches(){const t=await teamId();return (await rows('tranare',t)).filter(r=>linked(r.Lag).includes(t)).map(r=>({id:r.id,full_name:r.Namn,team_id:t})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'sv'))}
  // New protected staff writes use Swedish role names, while existing UI selectors use stable English keys.
  const staffRoles = Object.freeze({ leader: 'Lagledare', fitness: 'Fysansvarig', equipment: 'Materialförvaltare' });
  async function listStaff(role){const t=await teamId();const scoped=rosterReadOptions(t);const response=await fetch(`${API}/api/lagpersonal?team_id=${t}`,{cache:'no-store',headers:scoped.headers});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Kunde inte hämta lagpersonal');return (data.results||[]).filter(r=>r.role===role||r.role===staffRoles[role]).map(r=>({id:r.id,full_name:r.name,team_id:t})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'sv'))}
  async function writeStaff(method,role,rowId,name){const personal=window.APP_CONFIG?.REQUIRE_PERSONAL_ROSTER_WRITES===true;const selected=personal?window.Auth?.activeTeam?.():null;const t=await teamId();if(personal&&(!selected||window.Auth?.activeTeam?.()!==selected))throw new Error('Lagvalet ändrades. Välj lag och försök igen.');if(!staffRoles[role])throw new Error('Ogiltig funktion för lagpersonal');const writeRole=window.APP_CONFIG?.REQUIRE_PERSONAL_ROSTER_WRITES===true?staffRoles[role]:role;const data=await adminRequest(`/api/lagpersonal?team_id=${t}`,method,{id:rowId||undefined,role:writeRole,name:String(name||'').trim()});return data.row}
  async function listPools(){const t=await teamId();return (await rows('poolspel',t)).filter(r=>linked(r.Lag).includes(t)).map(r=>({id:r.id,team_id:t,title:r.Namn,place:r.Plats,hall:r.Ishall||"",pool_date:r.Datum,active:(typeof r.Status === 'object' ? r.Status?.value : r.Status) !== 'Avslutat',status:(typeof r.Status === 'object' ? r.Status?.value : r.Status) || 'Planerat',teams:num(r['Antal lag']),matches:num(r['Antal matcher']),players_on_field:num(r['Spelare på plan']),periods:num(r.Perioder),period_time:num(r.Periodtid),sub_time:num(r.Bytestid)})).sort((a,b)=>String(b.pool_date||'').localeCompare(String(a.pool_date||'')))}
  async function getPool(poolId){return (await listPools()).find(r=>String(r.id)===String(poolId))||null}
  async function listPoolTeamMatchConfigs(poolId){return (await rows('matchkonfiguration',await teamId())).filter(r=>first(r.Poolspel)==id(poolId)).map(r=>({id:r.id,pool_id:id(poolId),lag_no:num(r.Lagnummer,1),match_no:num(r.Matchnummer,1),start_time:r.Starttid||null,opponent:r.Motståndare||'',plan:r.Plan||'',player_count:num(r['Antal spelare']),goalie_player_id:first(r.Målvakt),players_on_field:linked(r['Spelare på plan'])})).sort((a,b)=>a.lag_no-b.lag_no||a.match_no-b.match_no)}
  async function getPoolTeamMatchConfig(poolId,lagNo,matchNo){return (await listPoolTeamMatchConfigs(poolId)).find(r=>r.lag_no==lagNo&&r.match_no==matchNo)||null}
  async function getPlayersOnField(poolId,lagNo,matchNo){const players=await listPlayers();const row=await getPoolTeamMatchConfig(poolId,lagNo,matchNo)||await getPoolTeamMatchConfig(poolId,lagNo,1);return row?.players_on_field?.length?players.filter(p=>row.players_on_field.includes(p.id)):players}
  async function getLineup(matchConfigId){return (await rows('laguppstallningar',await teamId())).filter(r=>first(r.Matchkonfiguration)==id(matchConfigId)).map(r=>({id:r.id,pool_id:first(r.Poolspel),match_config_id:id(matchConfigId),person_type:(typeof r.Persontyp==='object'?r.Persontyp?.value:r.Persontyp)==='Spelare'?'player':(typeof r.Persontyp==='object'?r.Persontyp?.value:r.Persontyp)==='Tränare'?'coach':null,person_id:num(r['Person-ID']),sort_order:num(r.Sorteringsordning)})).filter(r=>r.person_id&&r.person_type).sort((a,b)=>a.sort_order-b.sort_order)}
  async function listUsedPlayersInPool(poolId,currentLagNo){const cfg=(await listPoolTeamMatchConfigs(poolId)).filter(r=>r.lag_no!=currentLagNo);const result=await Promise.all(cfg.map(c=>getLineup(c.id)));return [...new Set(result.flat().filter(r=>r.person_type==='player').map(r=>r.person_id))]}
  async function listShiftSchema(poolId,lagNo,matchNo){return (await rows('bytesschema',await teamId())).filter(r=>first(r.Poolspel)==id(poolId)&&num(r.Lagnummer)==lagNo&&num(r.Matchnummer)==matchNo).map(r=>({id:r.id,pool_id:id(poolId),lag_no:num(r.Lagnummer),match_no:num(r.Matchnummer),shift_no:num(r.Bytenummer),period_no:num(r.Periodnummer),time_left:r['Tid kvar']||'',players_json:linked(r['Spelare på plan']),done:!!r.Genomfört})).sort((a,b)=>a.shift_no-b.shift_no)}
  // Målvaktsstatistik härleds från sparade matchkonfigurationer.
  // Endast matcher med en vald målvakt räknas; tomma statistikposter ignoreras.
  async function listGoalieStats(){
    const [pools, players] = await Promise.all([listPools(), listPlayers()]);
    const names = new Map(players.map(p => [Number(p.id), String(p.full_name || '').trim()]));
    const configsByPool = await Promise.all(pools.map(p => listPoolTeamMatchConfigs(p.id)));
    const matches = new Map();
    for (let i = 0; i < pools.length; i++) {
      for (const config of configsByPool[i]) {
        const name = names.get(Number(config.goalie_player_id));
        if (!name) continue;
        const matchId = `${pools[i].id}:${config.lag_no}:${config.match_no}`;
        matches.set(matchId, {goalie_name:name, match_id:matchId});
      }
    }
    return [...matches.values()];
  }
  async function listPlayerCoachMap(){const [map,players,coaches]=await Promise.all([rows('spelaretranare',await teamId()),listPlayers(),listCoaches()]);return map.map(r=>({id:r.id,player_name:players.find(p=>p.id===first(r.Spelare))?.full_name||'',coach_name:coaches.find(c=>c.id===first(r.Tränare))?.full_name||''})).filter(r=>r.player_name)}
  async function adminRequest(path,method,payload){
    const personalPoolWrite = window.APP_CONFIG?.REQUIRE_PERSONAL_POOL_WRITES === true &&
      /^\/api\/poolspel(?:\/\d+(?:\/aktiv)?)?$/.test(path) &&
      ['POST','PATCH'].includes(method);
    const personalMatchWrite = window.APP_CONFIG?.REQUIRE_PERSONAL_MATCH_WRITES === true &&
      (/^\/api\/matchkonfiguration(?:\/\d+)?$/.test(path) ||
       /^\/api\/laguppstallningar\/\d+$/.test(path)) &&
      ['POST','PATCH'].includes(method);
    const personalRosterWrite = window.APP_CONFIG?.REQUIRE_PERSONAL_ROSTER_WRITES === true &&
      (/^\/api\/(?:spelare|tranare)(?:\/\d+)?$/.test(path) || /^\/api\/lagpersonal\?team_id=\d+$/.test(path)) &&
      ['POST','PATCH','DELETE'].includes(method);
    const personalWrite = personalPoolWrite || personalMatchWrite || personalRosterWrite;
    // Legacy player/coach writes target Team 18; fail closed if a different team is active.
    if (personalRosterWrite && /^\/api\/(?:spelare|tranare)(?:\/\d+)?$/.test(path) &&
        window.Auth?.activeTeam?.() !== 'NSK Team 18')
      throw new Error('Välj NSK Team 18 för att ändra spelare eller tränare.');
    const personalToken = personalWrite ? window.Auth?.getToken?.() : null;
    const token = personalWrite ? personalToken : localStorage.getItem('nsk_admin_token');
    if(!token)throw new Error(personalPoolWrite ? 'Personlig inloggning krävs för att ändra poolspel.' :
      personalMatchWrite ? 'Personlig inloggning krävs för match och laguppställning.' :
      personalRosterWrite ? 'Personlig inloggning krävs för att ändra truppen.' : 'Aktivera Adminläge först.');
    if (personalRosterWrite) {
      const team = window.Auth?.activeTeam?.();
      if (!team || typeof window.Auth?.checkTeamFeature !== 'function' ||
          !await window.Auth.checkTeamFeature('roster', team))
        throw new Error('Saknar personlig behörighet att ändra truppen för valt lag.');
      // Permission verification is asynchronous; abort if the user changed teams meanwhile.
      if (window.Auth?.activeTeam?.() !== team)
        throw new Error('Lagvalet ändrades. Välj lag och försök igen.');
    }
    const response=await fetch(`${API}${path}`,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
    let data;try{data=await response.json()}catch{throw new Error('Ogiltigt svar från servern')}
    if(!response.ok||!data.ok)throw new Error(data.error||'Kunde inte spara');
    return data;
  }
  async function writeName(table,method,rowId,name){return (await adminRequest(`/api/${table}${rowId?'/'+encodeURIComponent(rowId):''}`,method,{name:String(name||'').trim()})).row}
  async function updatePoolTeams(poolId,teams){return (await adminRequest(`/api/poolspel/${encodeURIComponent(poolId)}`,'PATCH',{teams})).row}
  async function writePool(method,rowId,payload){return (await adminRequest(`/api/poolspel${rowId?'/'+encodeURIComponent(rowId):''}`,method,payload)).row}
  const addPool=payload=>writePool('POST',null,payload);
  const updatePool=(rowId,payload)=>writePool('PATCH',rowId,payload);
  const updatePoolActive=(rowId,active)=>adminRequest(`/api/poolspel/${encodeURIComponent(rowId)}/aktiv`,'PATCH',{active});
  const addPlayer=name=>writeName('spelare','POST',null,name);
  const updatePlayer=(rowId,name)=>writeName('spelare','PATCH',rowId,name);
  const addCoach=name=>writeName('tranare','POST',null,name);
  const updateCoach=(rowId,name)=>writeName('tranare','PATCH',rowId,name);
  let pending=Promise.resolve();
  function serialWrite(fn){const next=pending.catch(()=>{}).then(fn);pending=next.catch(()=>{});return next}
  async function saveCalendarMatchSchedule(payload){
    return serialWrite(async()=>{
      const poolId=id(payload.pool_id),lagNo=id(payload.lag_no),matchNo=id(payload.match_no);
      const start=String(payload.start_time||''),opponent=String(payload.opponent||'').trim();
      if(![poolId,lagNo,matchNo].every(positive) || (start !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) || !opponent || opponent.length>150)
        throw new Error('Ogiltig kalendermatch');
      if(window.APP_CONFIG?.REQUIRE_PERSONAL_MATCH_WRITES!==true)
        throw new Error('Personlig matchbehörighet måste vara aktiverad');
      // Servern verifierar medlemskap och matchbehörighet och nekar dubbletter.
      return (await adminRequest('/api/matchkonfiguration','POST',{
        pool_id:poolId,lag_no:lagNo,match_no:matchNo,start_time:start || null,
        opponent,plan:String(payload.plan||'Plan 1').slice(0,80),schedule_only:true
      })).row;
    });
  }
  async function savePoolTeamMatchConfig(payload){
    return serialWrite(async()=>{
      const poolId=id(payload.pool_id),lagNo=id(payload.lag_no),matchNo=id(payload.match_no);
      const goalie=id(payload.goalie_player_id);
      const players=(payload.players_on_field||[]).map(Number);
      const emptyDraft=payload.player_count==null && goalie==null && Array.isArray(payload.players_on_field) && players.length===0;
      if(![poolId,lagNo,matchNo,...(emptyDraft?[]:[goalie]),...players].every(positive))throw new Error('Ogiltiga ID:n i matchkonfiguration');
      const old=await getPoolTeamMatchConfig(poolId,lagNo,matchNo);
      const path=old?`/api/matchkonfiguration/${old.id}`:'/api/matchkonfiguration';
      const data=await adminRequest(path,old?'PATCH':'POST',{...payload,pool_id:poolId,lag_no:lagNo,match_no:matchNo,goalie_player_id:goalie,players_on_field:players});
      return {id:data.row.id,...payload};
    });
  }
  async function saveLineup(configId,players,coaches){
    return serialWrite(async()=>{
      if(!positive(configId)||![...players,...coaches].every(positive))throw new Error('Ogiltiga ID:n i laguppställningen');
      return adminRequest(`/api/laguppstallningar/${Number(configId)}`,'POST',{players:players.map(Number),coaches:coaches.map(Number)});
    });
  }
  // Tränarval använder personlig behörighet först när API och klient aktiverats tillsammans.
  const personalCoachSelectionEnabled=()=>window.APP_CONFIG?.REQUIRE_PERSONAL_COACH_SELECTION===true;
  async function getCoachSelection(poolId,lagNo,matchNo){
    const token=personalCoachSelectionEnabled()?window.Auth?.getToken?.():localStorage.getItem('nsk_admin_token');
    if(!token)throw new Error(personalCoachSelectionEnabled()?'Personlig inloggning krävs för tränarval.':'Aktivera Adminläge för att hämta tränarval.');
    const params=new URLSearchParams({pool_id:String(poolId),lag_no:String(lagNo),match_no:String(matchNo)});
    const response=await fetch(`${API}/api/coach-selection?${params}`,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Kunde inte hämta tränarval');
    return {coach_ids:Array.isArray(data.coach_ids)?data.coach_ids.map(Number):[],saved:!!data.saved};
  }
  async function saveCoachSelection(poolId,lagNo,matchNo,coachIds){
    const payload={pool_id:Number(poolId),lag_no:Number(lagNo),match_no:Number(matchNo),
      coach_ids:[...new Set(coachIds.map(Number))]};
    if(!personalCoachSelectionEnabled())return adminRequest('/api/coach-selection','POST',payload);
    const token=window.Auth?.getToken?.();
    if(!token)throw new Error('Personlig inloggning krävs för att spara tränarval.');
    const response=await fetch(`${API}/api/coach-selection`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Kunde inte spara tränarval');
    return data;
  }
  // Personal sessions take priority for shift writes. Legacy admin is used only without a personal session.
  async function shiftSaveRequest(payload){
    const token=(window.Auth?.getSession?.() ? window.Auth.getToken() : null);
    if(!token)return adminRequest('/api/bytesschema/save','POST',payload);
    const response=await fetch(`${API}/api/bytesschema/save`,{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||'Kunde inte spara bytesschema');
    return data;
  }
  async function saveShiftSchema(poolId,lagNo,matchNo,shifts){
    return serialWrite(async()=>{
      const payload={pool_id:Number(poolId),lag_no:Number(lagNo),match_no:Number(matchNo),shifts:shifts.map(s=>({period_no:Number(s.period_no),time_left:String(s.time_left),players:s.players.map(Number)}))};
      // Uppdatera ett byte per Worker-anrop; återuppta säkert efter avbrott.
      for(let attempt=0;attempt<100;attempt++){
        const result=await shiftSaveRequest(payload);
        if(!result.cleanup_pending){
          if(Number(result.count) !== shifts.length) throw new Error(`Workern rapporterade ${result.count} sparade byten, men ${shifts.length} förväntades. Kontrollera Baserow innan nytt försök.`);
          return result;
        }
      }
      throw new Error('Uppdateringen tog för många omgångar. Kontrollera sparade byten innan nytt försök.');
    });
  }
  async function deleteShiftSchema(poolId,lagNo,matchNo){
    return saveShiftSchema(poolId,lagNo,matchNo,[]);
  }
  // Matchcode only authorizes marking existing shifts as completed.
  async function matchRequest(path,payload){
    const key='nsk_match_token';
    async function send(token){
      const response=await fetch(`${API}${path}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(payload)});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw Object.assign(new Error(data.error||'Kunde inte spara byte'),{status:response.status});
      return data;
    }
    const personalToken=(window.Auth?.getSession?.() ? window.Auth.getToken() : null);
    if(personalToken)return send(personalToken);
    let token=localStorage.getItem(key);
    if(token){try{return await send(token)}catch(error){if(error.status!==401)throw error;localStorage.removeItem(key)}}
    const adminToken=localStorage.getItem('nsk_admin_token');
    if(adminToken){try{return await send(adminToken)}catch(error){if(error.status!==401)throw error}}
    const password=window.prompt('Ange gemensam matchkod för att spara genomförda byten:');
    if(password===null)throw new Error('Ingen matchkod angavs.');
    if(!password.trim())throw new Error('Matchkod saknas.');
    const loginResponse=await fetch(`${API}/api/match/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    const loginData=await loginResponse.json().catch(()=>({}));
    if(!loginResponse.ok||!loginData.ok||!loginData.token)throw new Error(loginData.error||'Fel matchkod');
    localStorage.setItem(key,loginData.token);
    return send(loginData.token);
  }
  async function setShiftDone(poolId,lagNo,matchNo,shiftNo,done){
    return serialWrite(async()=>{
      const shifts=await listShiftSchema(poolId,lagNo,matchNo);
      const shift=shifts.find(s=>s.shift_no===Number(shiftNo));
      if(!shift)throw new Error('Bytet hittades inte');
      return matchRequest(`/api/bytesschema/${shift.id}/done`,{done:!!done});
    });
  }
  return {listPlayers,listCoaches,listStaff,listPools,getPool,listPoolTeamMatchConfigs,getPoolTeamMatchConfig,getPlayersOnField,getLineup,listUsedPlayersInPool,listShiftSchema,listGoalieStats,listPlayerCoachMap,
    addPlayer,updatePlayer,deletePlayer:failWrite,addCoach,updateCoach,deleteCoach:failWrite,addStaff:(role,name)=>writeStaff('POST',role,null,name),updateStaff:(role,rowId,name)=>writeStaff('PATCH',role,rowId,name),updatePoolTeams,addPool,updatePool,updatePoolActive,deletePool:failWrite,
    saveCalendarMatchSchedule,savePoolTeamMatchConfig,saveLineup,getCoachSelection,saveCoachSelection,saveShiftSchema,deleteShiftSchema,setShiftDone,savePlayerCoachMap:failWrite,subscribeTruppen:async()=>({unsubscribe(){}})};
})();
