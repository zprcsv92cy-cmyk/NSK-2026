/**
 * Pure calendar import mapping. Does not write to Baserow or require a lineup.
 * Match metadata is persisted separately by the API integration.
 */
export function planCalendarMatches(matches) {
  if (!Array.isArray(matches)) throw new TypeError('Matcher måste vara en lista');
  const valid = matches.filter(m =>
    m && (m.startTime == null || m.startTime === '' || m.startTime === '00:00' ||
      (typeof m.startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.startTime))) &&
    typeof m.opponent === 'string' && m.opponent.trim()
  ).sort((a, b) => (a.startTime && a.startTime !== '00:00' ? a.startTime : '99:99').localeCompare(b.startTime && b.startTime !== '00:00' ? b.startTime : '99:99')).slice(0, 16);
  const teams = valid.length > 4 ? 2 : 1;
  const perTeam = Math.ceil(valid.length / teams);
  return {
    teams,
    matchesPerTeam: perTeam,
    schedule: valid.map((m, i) => ({
      lag_no: Math.floor(i / perTeam) + 1,
      match_no: i % perTeam + 1,
      start_time: m.startTime && m.startTime !== '00:00' ? m.startTime : null,
      opponent: m.opponent.trim(),
      plan: typeof m.plan === 'string' ? m.plan.slice(0, 80) : ''
    }))
  };
}

// Complete metadata only. Existing match IDs, positions and lineups are never rewritten.
export function planCalendarCompletion(pool, existing, matches) {
  const plan=planCalendarMatches(matches);
  if(!plan.schedule.length||pool.active===false||Number(pool.teams)!==plan.teams)
    throw Error('Kalendern stämmer inte med poolspelets lag. Kontrollera manuellt.');
  const remaining=[...plan.schedule],used=new Set();
  const name=s=>String(s||'').normalize('NFKC').trim().toLocaleLowerCase('sv-SE');
  for(const row of existing){
    const slot=Number(row.lag_no)+':'+Number(row.match_no);
    if(used.has(slot))throw Error('Dubbla matchnummer måste kontrolleras manuellt.');
    used.add(slot);
    const candidates=remaining.filter(m=>m.lag_no===Number(row.lag_no)&&name(m.opponent)===name(row.opponent));
    if(candidates.length!==1)throw Error('En sparad match skiljer sig från kalendern. Ingen match skrivs över.');
    const match=candidates[0];
    const oldTime=String(row.start_time||'').slice(0,5);
    if(match.start_time&&oldTime&&oldTime!=='00:00'&&oldTime!==match.start_time)
      throw Error('En sparad starttid skiljer sig från kalendern. Kontrollera manuellt.');
    remaining.splice(remaining.indexOf(match),1);
  }
  const capacity=Math.max(Number(pool.matches)||0,plan.matchesPerTeam,...existing.map(r=>Number(r.match_no)));
  if(capacity>8)throw Error('Högst åtta matcher per lag stöds.');
  return {matches:capacity,missing:remaining.map(m=>{
    let number=1;while(used.has(m.lag_no+':'+number))number++;
    if(number>capacity)throw Error('Matchfördelningen behöver kontrolleras manuellt.');
    used.add(m.lag_no+':'+number);return {...m,match_no:number};
  })};
}
export async function completeCalendarPool(db,poolId,matches){
  const pool=await db.getPool(poolId);
  if(!pool)throw Error('Poolspelet kunde inte läsas.');
  const plan=planCalendarCompletion(pool,await db.listPoolTeamMatchConfigs(poolId),matches);
  if(plan.matches>Number(pool.matches)){
    const payload={};
    for(const key of ['title','place','hall','pool_date','teams','players_on_field','periods','period_time','sub_time'])payload[key]=pool[key];
    await db.updatePool(poolId,{...payload,matches:plan.matches,status:'Aktiv'});
  }
  for(const match of plan.missing)await db.saveCalendarMatchSchedule({pool_id:Number(poolId),...match});
  return {added:plan.missing.length};
}
