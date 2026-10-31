// Presentation only: never updates, removes or creates stored activities.
const text=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('sv-SE');
const unknown=value=>!text(value)||/inställd|inställ|cancelled|okänd|ej angiven|ej bestämd/u.test(text(value));
const venue=item=>{const value=item.hall||item.place;return unknown(value)?'':text(value).replace(/^smehallen b$/,'smehallen');};
const time=match=>{const value=String(match.startTime||match.start_time||'').trim();return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)&&value!=='00:00'?value:'';};
const opponent=match=>text(match.opponent);
function fixtures(item,all){
 if(item.matches?.length)return item.matches;
 const label=x=>venue(x)||text(x.hall||x.place);
 return all.filter(m=>m.type==='match'&&m.date===item.date&&((item.activityId&&m.poolActivityId)?String(item.activityId)===String(m.poolActivityId):label(item)&&label(item)===label(m)));
}
function sameFixtures(a,b){
 if(a.length!==b.length||!a.length||a.some(m=>!opponent(m))||b.some(m=>!opponent(m)))return false;
 // Repeated opponents require explicit activity identity, not an inferred match.
 if(new Set(a.map(opponent)).size!==a.length||new Set(b.map(opponent)).size!==b.length)return false;
 return a.every(m=>{const n=b.find(n=>opponent(m)===opponent(n));if(!n)return false;
  if(m.ownTeam&&n.ownTeam&&text(m.ownTeam)!==text(n.ownTeam))return false;
  if(time(m)&&time(n)&&time(m)!==time(n))return false;
  return a.length>1||!!time(m)&&time(m)===time(n);
 });
}
function sameEvent(a,b,all){
 if(a.date!==b.date)return false;
 if(venue(a)&&venue(b)&&venue(a)!==venue(b))return false;
 return sameFixtures(fixtures(a,all),fixtures(b,all));
}
export function reconcileCalendarPools(items,pools,summaries=new Map()){
 const output=items.map(item=>({...item,date:String(item.date||'').slice(0,10),sourceKeys:[...new Set([...(item.sourceKeys||[]),item.key,...(item.matches||[]).map(m=>m.key)].filter(Boolean))]})),removed=new Set(),links=new Map();
 const candidates=output.filter(item=>item.type==='pool');
 // Merge only unique, reciprocal pairs from different sources. Ambiguity stays visible.
 const peers=new Map(candidates.map(a=>[a,candidates.filter(b=>a!==b&&text(a.source||'svenskalag')!==text(b.source||'svenskalag')&&sameEvent(a,b,output))]));
 for(const a of candidates){
  if(removed.has(a))continue;
  const matches=peers.get(a);if(matches.length!==1||peers.get(matches[0]).length!==1)continue;
  const b=matches[0];if(removed.has(b))continue;
  const score=item=>(venue(item)?100:0)+fixtures(item,output).filter(time).length;
  const rich=score(a)>=score(b)?a:b,notice=[a.notice,b.notice,...[a,b].filter(x=>unknown(x.place)&&text(x.place)).map(x=>'SvenskaLag anger '+x.place+'. Kontrollera med arrangören före start.')].filter(Boolean);
  a.place=rich.place;a.hall=rich.hall;a.notice=[...new Set(notice)].join(' ');
  a.matches=fixtures(rich,output).map(m=>({...m}));a.source=[...new Set([a.source||'SvenskaLag',b.source||'SvenskaLag'])].join(' + ');a.sourceUrl=a.sourceUrl||b.sourceUrl;
  a.sourceKeys=[...new Set([...a.sourceKeys,...b.sourceKeys,...fixtures(a,output).map(m=>m.key),...fixtures(b,output).map(m=>m.key)].filter(Boolean))];
  removed.add(b);
 }
 // Consolidate pool cards sharing a date and known venue, across sources.
 const byVenue=new Map();
 for(const item of candidates){
  if(removed.has(item)||!venue(item))continue;
  const key=item.date+'|'+venue(item);
  const primary=byVenue.get(key);
  if(!primary){byVenue.set(key,item);continue;}
  const seen=new Set();
  primary.matches=[...fixtures(primary,output),...fixtures(item,output)].filter(m=>{
   const key=[opponent(m),time(m),text(m.ownTeam)].join('|');
   if(seen.has(key))return false;
   seen.add(key);return true;
  }).map(m=>({...m}));
  primary.notice=[...new Set([primary.notice,item.notice].filter(Boolean))].join(' ');
  primary.source=[...new Set([primary.source,item.source].filter(Boolean))].join(' + ');
  primary.sourceUrl=primary.sourceUrl||item.sourceUrl;
  primary.sourceKeys=[...new Set([...primary.sourceKeys,...item.sourceKeys,...fixtures(item,output).map(m=>m.key)].filter(Boolean))];
  removed.add(item);
 }
 // A source may label the same pool as "EV inställd" or omit the rink entirely.
 // Combine such cards only when their named fixtures overlap and there is no
 // competing identified rink on that date. Never merge by date alone.
 for(const item of candidates){
  if(removed.has(item)||venue(item))continue;
  const related=candidates.filter(other=>other!==item&&!removed.has(other)&&other.date===item.date);
  const mine=fixtures(item,output).map(opponent).filter(Boolean);
  if(!mine.length)continue;
  const overlaps=related.filter(other=>fixtures(other,output).some(m=>mine.includes(opponent(m))));
  if(overlaps.length!==1)continue;
  const primary=overlaps[0];
  const competitors=related.filter(other=>other!==primary&&venue(other)&&venue(other)!==venue(primary));
  if(competitors.length)continue;
  const combined=[...fixtures(primary,output),...fixtures(item,output)];
  const seen=new Set();
  primary.matches=combined.filter(m=>{
   const key=[opponent(m),time(m),text(m.ownTeam)].join('|');
   if(seen.has(key))return false;
   seen.add(key);return true;
  }).map(m=>({...m}));
  primary.notice=[...new Set([primary.notice,item.notice,...[item].filter(x=>unknown(x.place)&&text(x.place)).map(x=>'SvenskaLag anger '+x.place+'. Kontrollera med arrangören före start.')].filter(Boolean))].join(' ');
  primary.source=[...new Set([primary.source,item.source].filter(Boolean))].join(' + ');
  primary.sourceUrl=primary.sourceUrl||item.sourceUrl;
  primary.sourceKeys=[...new Set([...primary.sourceKeys,...item.sourceKeys,...fixtures(item,output).map(m=>m.key)].filter(Boolean))];
  removed.add(item);
 }
 const remaining=candidates.filter(item=>!removed.has(item));
 for(const item of remaining){
  const matches=pools.filter(pool=>sameEvent({date:String(pool.pool_date||'').slice(0,10),place:pool.place,hall:pool.hall,matches:summaries.get(String(pool.id))||[]},item,output));
  if(matches.length!==1)continue;
  // Two source groups claiming the same stored event are not silently collapsed.
  const pool=matches[0];const claims=remaining.filter(other=>sameEvent({date:String(pool.pool_date||'').slice(0,10),place:pool.place,hall:pool.hall,matches:summaries.get(String(pool.id))||[]},other,output));
  if(claims.length===1)links.set(item,String(pool.id));
 }
 // Standalone matches are redundant only with exactly one fully identified source pool.
 for(const match of output.filter(item=>item.type==='match')){
  const owners=remaining.filter(pool=>pool.matches?.length&&pool.date===match.date&&(!venue(match)||!venue(pool)||venue(match)===venue(pool))&&fixtures(pool,output).some(m=>opponent(m)===opponent(match)&&time(m)&&time(m)===time(match)&&(!m.ownTeam||!match.ownTeam||text(m.ownTeam)===text(match.ownTeam))));
  if(owners.length===1){owners[0].sourceKeys=[...new Set([...owners[0].sourceKeys,match.key].filter(Boolean))];removed.add(match);}
 }
 for(const item of remaining){
  if(unknown(item.hall||item.place)&&text(item.hall||item.place)){
   item.matches=fixtures(item,output).map(m=>({...m}));
   item.notice=[item.notice,'SvenskaLag anger '+(item.hall||item.place)+'. Kontrollera med arrangören före start.'].filter(Boolean).join(' ');
   item.place='';item.hall='';
  }
 }
 return {items:output.filter(item=>!removed.has(item)),links};
}
