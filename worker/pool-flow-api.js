import {lineupSnapshot} from '../concurrency-merge.mjs';
// Additive boundary: retain existing authentication and write handlers for every delegated operation.
export function withPoolFlow(original,{resolveTables,listTeams,verifyIdentity,authorize,fetcher=globalThis.fetch}){
 const links=v=>Array.isArray(v)?v.map(x=>Number(typeof x==='object'?x.id:x)):[];
 const positive=n=>Number.isSafeInteger(n)&&n>0;
 const closed=p=>p?.Aktiv===false||/avslut/i.test(String(p?.Status?.value||p?.Status||''));
 return async function(req,env,ctx){
  if(env.NSK_POOL_FLOW_ENABLED!=='true')return original(req,env,ctx);
  const url=new URL(req.url),path=url.pathname,write=!['GET','HEAD','OPTIONS'].includes(req.method);
  const special=/^\/api\/poolspel\/(\d+)\/(match-info|lineup|material)$/.exec(path),remove=/^\/api\/poolspel\/(\d+)$/.exec(path)&&req.method==='DELETE';
  const protectedWrite=write&&(/^\/api\/(poolspel|matchkonfiguration|laguppstallningar|bytesschema)(\/|$)/.test(path)||path==='/api/coach-selection');
  const poolRead=req.method==='GET'&&path==='/api/poolspel';
  const scopedRead=req.method==='GET'&&(['/api/matchkonfiguration','/api/bytesschema'].includes(path)&&url.searchParams.has('pool_id')||path==='/api/laguppstallningar'&&url.searchParams.has('match_config_id'));
  const staff=req.method==='POST'&&path==='/api/lagpersonal/coach';
  if(!protectedWrite&&!poolRead&&!scopedRead&&!staff&&!special)return original(req,env,ctx);
  const allowedOrigin=env.NSK_ISOLATED_MODE==='true'?'https://nsk-app-isolated-preview.peter-hasselberg.workers.dev':'https://zprcsv92cy-cmyk.github.io';
  const origin=req.headers.get('Origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin===allowedOrigin?{'Access-Control-Allow-Origin':origin}:{})};
  const reply=(status,error,extra={})=>new Response(JSON.stringify({ok:status<400,...(error?{error}:{}),...extra}),{status,headers});
  if(origin&&origin!==allowedOrigin)return reply(403,'Origin not allowed');
  // Preflight contains no bearer token. Only the actual request may read or write data.
  if(req.method==='OPTIONS'&&special){
   const methods=special[2]==='material'?['GET','PUT']:['POST'];
   const method=req.headers.get('Access-Control-Request-Method');
   const requested=(req.headers.get('Access-Control-Request-Headers')||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
   if(origin!==allowedOrigin||!methods.includes(method)||requested.some(x=>!['authorization','content-type'].includes(x)))return reply(403,'Preflight not allowed');
   return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':methods.join(', ')+', OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
  }
  let operationId=null;
  try{
   if(scopedRead){
    const filters={};for(const key of ['pool_id','lag_no','match_no','match_config_id']){const values=url.searchParams.getAll(key);if(values.length){if(values.length!==1||!/^[1-9]\d*$/.test(values[0])||!positive(Number(values[0])))return reply(400,'Ogiltigt matchfilter');filters[key]=Number(values[0]);}}
    // First obtain the existing personally authorized, team-scoped response. Filters only narrow it.
    const response=await original(req,env,ctx);if(!response.ok)return response;const data=await response.clone().json();if(!Array.isArray(data.results))return response;
    data.results=data.results.filter(row=>(!filters.pool_id||links(row.Poolspel).includes(filters.pool_id))&&(!filters.lag_no||Number(row.Lagnummer)===filters.lag_no)&&(!filters.match_no||Number(row.Matchnummer)===filters.match_no)&&(!filters.match_config_id||links(row.Matchkonfiguration).includes(filters.match_config_id)));data.count=data.results.length;
    return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});
   }
   const tables=resolveTables(env),base='https://api.baserow.io/api/database/rows/table/',auth={Authorization:'Token '+env.BASEROW_TOKEN};
   const row=async(table,id)=>{const r=await fetcher(base+tables[table]+'/'+id+'/?user_field_names=true',{headers:auth});if(r.status===404)return null;if(!r.ok)throw Error('Databasen kunde inte läsas');return r.json();};
   const rows=async table=>{const result=[];for(let page=1;page<=100;page++){const r=await fetcher(base+tables[table]+'/?user_field_names=true&size=200&page='+page,{headers:auth});if(!r.ok)throw Error('Databasen kunde inte läsas');const d=await r.json();if(!Array.isArray(d.results)||d.results.length>200)throw Error('Ogiltigt databasunderlag');result.push(...d.results);if(!d.next)return result;}throw Error('För stort underlag');};
   if(poolRead){const response=await original(req,env,ctx);if(!response.ok)return response;const data=await response.clone().json();if(!Array.isArray(data.results))return response;const deleted=await env.AUTH_DB.prepare('SELECT pool_id,step,plan_json FROM pool_flow_deletions').all();const hidden=new Set((deleted.results||[]).filter(x=>Array.isArray(JSON.parse(x.plan_json))&&Number(x.step)>=JSON.parse(x.plan_json).length).map(x=>Number(x.pool_id)));const deleting=new Set((deleted.results||[]).map(x=>Number(x.pool_id)));const imports=await env.AUTH_DB.prepare('SELECT pool_id FROM pool_flow_calendar').all();const imported=new Set((imports.results||[]).map(x=>Number(x.pool_id)));const saves=await env.AUTH_DB.prepare("SELECT pool_id,lag_no,match_no FROM pool_flow_saves WHERE status='pending'").all();data.results=data.results.filter(x=>!hidden.has(Number(x.id))).map(x=>({...x,nsk_calendar_imported:imported.has(Number(x.id)),nsk_deleting:deleting.has(Number(x.id)),nsk_pending_matches:(saves.results||[]).filter(s=>Number(s.pool_id)===Number(x.id)).map(s=>({lag_no:s.lag_no,match_no:s.match_no}))}));data.count=data.results.length;return new Response(JSON.stringify(data),{status:response.status,headers:response.headers});}
   const token=/^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.headers.get('Authorization')||'')?.[1];
   if(!token)return reply(401,'Personlig inloggning krävs');
   const actor=await verifyIdentity(env,token);if(!actor)return reply(401,'Giltig inloggning krävs');
   let body={};if(!['DELETE','GET','HEAD'].includes(req.method)){if(Number(req.headers.get('Content-Length')||0)>65536)return reply(413,'För stor begäran');try{const reader=req.clone().body?.getReader();let raw='',length=0;const decoder=new TextDecoder();if(reader){for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>65536){void reader.cancel();void req.body?.cancel();return reply(413,'För stor begäran');}raw+=decoder.decode(chunk.value,{stream:true});}raw+=decoder.decode();}body=JSON.parse(raw);}catch{return reply(400,'Ogiltig JSON');}}
   if(staff){
    const teamId=url.searchParams.getAll('team_id');if(teamId.length!==1||!positive(Number(teamId[0]))||!positive(body.coach_id)||Object.keys(body).length!==1)return reply(400,'Ogiltigt tränarval');
    const team=(await listTeams(env)).filter(t=>Number(t.id)===Number(teamId[0]));if(team.length!==1)return reply(404,'Laget saknas');
    const grant=authorize(actor,team[0].Namn,'roster');if(!grant.allowed)return reply(grant.status||403,grant.reason);
    const coach=await row('tranare',body.coach_id);if(!coach||!links(coach.Lag).includes(Number(teamId[0])))return reply(403,'Tränaren tillhör inte laget');
    const key='lagpersonal:team:'+teamId[0],stored=await env.NSK_TRAINERS.get(key,'json')||[];
    const found=stored.find(r=>r.role==='Materialförvaltare'&&(r.coach_id===body.coach_id||r.name?.trim().toLocaleLowerCase('sv')===coach.Namn.trim().toLocaleLowerCase('sv')));
    if(found){found.coach_id=body.coach_id;found.name=coach.Namn;await env.NSK_TRAINERS.put(key,JSON.stringify(stored));return reply(200,null,{row:found});}
    const response=await original(new Request(new URL('/api/lagpersonal?team_id='+teamId[0],req.url),{method:'POST',headers:{Authorization:req.headers.get('Authorization'),'Content-Type':'application/json'},body:JSON.stringify({role:'Materialförvaltare',name:coach.Namn})}),env,ctx);
    if(!response.ok)return response;const data=await response.clone().json();const saved=await env.NSK_TRAINERS.get(key,'json')||[];const selected=saved.find(r=>r.id===data.row.id);if(!selected)throw Error('Materialuppdraget kunde inte kopplas');selected.coach_id=body.coach_id;await env.NSK_TRAINERS.put(key,JSON.stringify(saved));return reply(201,null,{row:selected});
   }
   let poolId=special?Number(special[1]):Number(/^\/api\/poolspel\/(\d+)/.exec(path)?.[1]||body.pool_id||0);
   let config=null;
   const configPath=/^\/api\/(matchkonfiguration|laguppstallningar)\/(\d+)$/.exec(path);
   if(configPath){config=await row('matchkonfiguration',Number(configPath[2]));if(!config)return reply(404,'Matchen saknas');const owners=links(config.Poolspel);if(owners.length!==1)return reply(503,'Matchens poolspel kunde inte verifieras');poolId=owners[0];}
   const shiftPath=/^\/api\/bytesschema\/(\d+)\/done$/.exec(path);
   if(shiftPath){const shift=await row('bytesschema',Number(shiftPath[1]));if(!shift)return reply(404,'Bytet saknas');const owners=links(shift.Poolspel);if(owners.length!==1)return reply(503,'Bytets poolspel kunde inte verifieras');poolId=owners[0];}
   if(!poolId){const response=await original(req,env,ctx);if(response.ok&&path==='/api/poolspel'&&body.calendar_import_key){const data=await response.clone().json();if(positive(Number(data.row?.id)))await env.AUTH_DB.prepare('INSERT OR IGNORE INTO pool_flow_calendar(pool_id) VALUES(?)').bind(Number(data.row.id)).run();}return response;}
   if(!positive(poolId))return reply(400,'Ogiltigt poolspel');
   const deletion=await env.AUTH_DB.prepare('SELECT * FROM pool_flow_deletions WHERE pool_id=?').bind(poolId).first();
   const pool=await row('poolspel',poolId);
   if(!pool&&!deletion)return reply(404,'Poolspelet saknas');
   const teamIds=pool?links(pool.Lag):[Number(deletion.team_row_id)];if(teamIds.length!==1)return reply(503,'Lagkopplingen kunde inte verifieras');
   const teams=(await listTeams(env)).filter(t=>Number(t.id)===teamIds[0]&&String(t['Säsong'])==='2026');if(teams.length!==1)return reply(503,'Laget kunde inte verifieras');
   let feature=remove?'pool':special?.[2]==='material'?'lineup':special?'matches':path==='/api/coach-selection'?'lineup':path.startsWith('/api/laguppstallningar')?'lineup':['/api/bytesschema/save','/api/bytesschema/retime'].includes(path)?(path.endsWith('/retime')?'pool':'lineup'):path.startsWith('/api/bytesschema')?'shifts':path.endsWith('/aktiv')?(body.active?'pool_reopen':'pool_finish'):path.startsWith('/api/poolspel')?'pool':'matches';
   const access=special?.[2]==='material'&&req.method==='GET'?{allowed:actor.permissions?.includes('read')&&actor.memberships?.some(m=>m.team_id===teams[0].Namn),status:403}:authorize(actor,teams[0].Namn,feature);if(!access.allowed)return reply(access.status||403,access.reason||'Saknar behörighet');
   if(remove){
    // Mark deletion before reading children. Atomic predicates exclude all active writers.
    const lease=crypto.randomUUID(),now=Date.now();
    if(!deletion)await env.AUTH_DB.prepare("INSERT OR IGNORE INTO pool_flow_deletions(pool_id,team_row_id,plan_json,step) SELECT ?,?,'null',0 WHERE NOT EXISTS(SELECT 1 FROM pool_flow_operations WHERE pool_id=? AND lease_until>?)").bind(poolId,teamIds[0],poolId,now).run();
    const job=await env.AUTH_DB.prepare('UPDATE pool_flow_deletions SET lease=?,lease_until=? WHERE pool_id=? AND lease_until<? RETURNING *').bind(lease,now+120000,poolId,now).first();
    if(!job)return reply(409,'Poolspelet sparas eller tas bort just nu. Vänta och försök igen.');
    try{
     let plan=JSON.parse(job.plan_json);
     if(!Array.isArray(plan)){
      const configs=(await rows('matchkonfiguration')).filter(r=>links(r.Poolspel).includes(poolId)),configIds=new Set(configs.map(r=>Number(r.id)));
      plan=[];
      for(const table of ['bytesschema','laguppstallningar','malvaktsstatistik','matcher'])for(const r of await rows(table)){
       const own=links(r.Poolspel).includes(poolId)||(table==='laguppstallningar'&&links(r.Matchkonfiguration).some(id=>configIds.has(id)))||(table==='malvaktsstatistik'&&String(r['Match-ID']||r['Match-id']||r.match_id||'').startsWith(poolId+':'));
       if(own){if(links(r.Poolspel).some(id=>id!==poolId)||(table==='laguppstallningar'&&links(r.Matchkonfiguration).some(id=>!configIds.has(id))))return reply(409,'En kopplad rad delas med annat poolspel');plan.push({table,id:Number(r.id)});}
      }
      plan.push(...configs.map(r=>({table:'matchkonfiguration',id:Number(r.id)})),{table:'poolspel',id:poolId});
      const stored=await env.AUTH_DB.prepare('UPDATE pool_flow_deletions SET plan_json=? WHERE pool_id=? AND lease=?').bind(JSON.stringify(plan),poolId,lease).run();
      if(!stored.meta?.changes)throw Error('Borttagningen behöver läsas om. Försök igen.');
     }
     let step=Number(job.step);const end=Math.min(step+15,plan.length);for(;step<end;step++){const item=plan[step];const r=await fetcher(base+tables[item.table]+'/'+item.id+'/',{method:'DELETE',headers:auth});if(!r.ok&&r.status!==404)throw Error('Raderingen avbröts. Tryck Ta bort igen för att fortsätta.');await env.AUTH_DB.prepare('UPDATE pool_flow_deletions SET step=? WHERE pool_id=? AND lease=?').bind(step+1,poolId,lease).run();}if(step===plan.length){for(let l=1;l<=Number(pool?.['Antal lag']||8);l++)for(let m=1;m<=Number(pool?.['Antal matcher']||8);m++)await env.NSK_TRAINERS?.delete('coaches:v1:'+poolId+':'+l+':'+m);return reply(200,null,{deleted:true});}return reply(200,null,{pending:true});
    }finally{
     // Failed planning has not deleted anything and must not leave the pool blocked.
     await env.AUTH_DB.prepare("DELETE FROM pool_flow_deletions WHERE pool_id=? AND lease=? AND plan_json='null'").bind(poolId,lease).run();
     await env.AUTH_DB.prepare('UPDATE pool_flow_deletions SET lease_until=0 WHERE pool_id=? AND lease=?').bind(poolId,lease).run();
    }
   }
   if(deletion)return reply(409,'Poolspelet håller på att tas bort.');
   if(write){
    const now=Date.now(),id=crypto.randomUUID();
    await env.AUTH_DB.prepare('DELETE FROM pool_flow_operations WHERE lease_until<=?').bind(now).run();
    const registered=await env.AUTH_DB.prepare('INSERT INTO pool_flow_operations(operation_id,pool_id,lease_until) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM pool_flow_deletions WHERE pool_id=?)').bind(id,poolId,now+300000,poolId).run();
    if(!registered.meta?.changes)return reply(409,'Poolspelet håller på att tas bort.');
    operationId=id;
   }

   if(path==='/api/poolspel/'+poolId&&req.method==='PATCH'){
    const fields={teams:'Antal lag',matches:'Antal matcher',players_on_field:'Spelare på plan',periods:'Perioder',period_time:'Periodtid'};
    if(Object.entries(fields).some(([key,field])=>body[key]!==undefined&&Number(body[key])!==Number(pool[field]))&&(await rows('bytesschema')).some(r=>links(r.Poolspel).includes(poolId)&&r.Genomfört===true))return reply(409,'Poolspelet har genomförda byten. Antal lag, matcher och spelregler är låsta.');
   }
   if(special?.[2]==='material'){
    if(!['GET','PUT'].includes(req.method))return reply(405,'Metoden stöds inte');
    const legacy=await env.AUTH_DB.prepare('SELECT coach_id,revision FROM pool_flow_equipment WHERE pool_id=?').bind(poolId).first();
    const current=await env.AUTH_DB.prepare('SELECT staff_ids_json,revision FROM pool_flow_material_staff WHERE pool_id=?').bind(poolId).first();
    const roster=await env.NSK_TRAINERS.get('lagpersonal:team:'+teamIds[0],'json')||[];
    if(!Array.isArray(roster))return reply(503,'Materialförvaltarna kunde inte läsas');
    const options=roster.filter(p=>['Materialförvaltare','equipment'].includes(p.role)&&typeof p.id==='string'&&typeof p.name==='string').map(p=>({id:p.id,name:p.name,coach_id:p.coach_id}));
    let selected=current?JSON.parse(current.staff_ids_json):options.filter(p=>p.coach_id===legacy?.coach_id&&legacy?.coach_id).map(p=>p.id);
    const revision=current?.revision||legacy?.revision||0;
    if(req.method==='PUT'){
     if(closed(pool))return reply(409,'Återöppna poolspelet före ändring.');
     let ids=body.staff_ids;
     if(ids===undefined&&Object.hasOwn(body,'coach_id')){if(body.coach_id===null)ids=[];else{ids=options.filter(p=>p.coach_id===body.coach_id).map(p=>p.id);if(!ids.length)return reply(403,'Välj en registrerad materialförvaltare i den uppdaterade appen.');}}
     if(!Number.isSafeInteger(body.revision)||body.revision<0||!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)return reply(400,'Ogiltigt materialval');
     if(ids.some(id=>!options.some(p=>p.id===id)))return reply(403,'Personen är inte materialförvaltare i laget');
     if(body.revision!==revision)return reply(409,'Materialvalet ändrades på annan enhet. Ladda om.');
     const saved=current?await env.AUTH_DB.prepare('UPDATE pool_flow_material_staff SET staff_ids_json=?,revision=revision+1 WHERE pool_id=? AND revision=? RETURNING revision').bind(JSON.stringify(ids),poolId,revision).first():await env.AUTH_DB.prepare('INSERT INTO pool_flow_material_staff(pool_id,staff_ids_json,revision) VALUES(?,?,?) ON CONFLICT(pool_id) DO NOTHING RETURNING revision').bind(poolId,JSON.stringify(ids),revision+1).first();
     if(!saved)return reply(409,'Materialvalet ändrades på annan enhet. Ladda om.');
     return reply(200,null,{revision:saved.revision,staff_ids:ids,name:options.filter(p=>ids.includes(p.id)).map(p=>p.name).join(', ')});
    }
    selected=selected.filter(id=>options.some(p=>p.id===id));
    const coach=!current&&!selected.length&&legacy?.coach_id?await row('tranare',legacy.coach_id):null;
    const legacyName=coach&&links(coach.Lag).includes(teamIds[0])?coach.Namn:'';
    return reply(200,null,{revision,staff_ids:selected,options:options.map(p=>({id:p.id,name:p.name})),legacy_name:legacyName,coach_id:null,name:options.filter(p=>selected.includes(p.id)).map(p=>p.name).join(', ')||legacyName});
   }
   if(closed(pool)&&!path.endsWith('/aktiv'))return reply(409,'Poolspelet är avslutat. Återöppna det före ändring.');
   if(env.NSK_MULTIUSER_ENABLED==='true'&&!special){
    if(/^\/api\/(?:matchkonfiguration|laguppstallningar)\/[1-9][0-9]*$/.test(path))return reply(428,'Läs om appen. Laguppställningar sparas med versionskontroll.');
    if(path==='/api/matchkonfiguration'&&req.method==='POST'&&(await rows('matchkonfiguration')).some(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===Number(body.lag_no)&&Number(r.Matchnummer)===Number(body.match_no)))return reply(409,'Matchen finns redan. Läs om laguppställningen.');
   }
   if(special){
    const info=special[2]==='match-info',data=info?Object.fromEntries(Object.entries(body).filter(([k])=>k!=='base')):body.config;
    if(!info){if(!Array.isArray(body.players)||!Array.isArray(body.coaches)||body.players.length>25||body.coaches.length>20||[...body.players,...body.coaches].some(n=>!positive(n))||new Set(body.players).size!==body.players.length||new Set(body.coaches).size!==body.coaches.length)return reply(400,'Ogiltiga spelar- eller tränarval');
     const expected=data?.goalie_player_id?[data.goalie_player_id,...body.players]:[];if(JSON.stringify(data?.players_on_field)!==JSON.stringify(expected)||body.players.length&&data.player_count!==body.players.length||body.players.includes(data?.goalie_player_id))return reply(400,'Uppställningen och matchuppgifterna stämmer inte överens');}

    if(!data||Number(data.pool_id)!==poolId||!positive(Number(data.lag_no))||!positive(Number(data.match_no)))return reply(400,'Ogiltig match');
    const configs=(await rows('matchkonfiguration')).filter(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===Number(data.lag_no)&&Number(r.Matchnummer)===Number(data.match_no));if(configs.length>1)return reply(409,'Dubbla matchposter finns. Inget sparades.');
    const old=configs[0];
    let configData=info?{...data,player_count:old?.['Antal spelare']||null,goalie_player_id:links(old?.Målvakt)[0]||null,players_on_field:links(old?.['Spelare på plan'])}:data;
    const internal=(pathname,method,payload)=>new Request(new URL(pathname,req.url),{method,headers:{Authorization:req.headers.get('Authorization'),'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(payload)});
    const lag=Number(data.lag_no),match=Number(data.match_no);
    const started=(await rows('bytesschema')).some(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===lag&&Number(r.Matchnummer)===match&&r.Genomfört===true);
    if(!info&&started)return reply(409,'Matchen har genomförda byten. Uppställningen är låst.');
    if(!info){const permission=authorize(actor,teams[0].Namn,'lineup');if(!permission.allowed)return reply(permission.status||403,permission.reason);}
    const lease=crypto.randomUUID(),now=Date.now();
    await env.AUTH_DB.prepare('INSERT OR IGNORE INTO pool_flow_saves(pool_id,lag_no,match_no,status) VALUES(?,?,?,?)').bind(poolId,lag,match,'ready').run();
    const lock=await env.AUTH_DB.prepare("UPDATE pool_flow_saves SET lease=?,lease_until=?,status=CASE WHEN ?='ready' THEN status ELSE 'pending' END WHERE pool_id=? AND lag_no=? AND match_no=? AND lease_until<? RETURNING *").bind(lease,now+300000,info||env.NSK_MULTIUSER_ENABLED==='true'?'ready':'pending',poolId,lag,match,now).first();if(!lock)return reply(409,'Matchen sparas redan. Försök igen.');
    try{
     if(env.NSK_MULTIUSER_ENABLED==='true'){
      if(!body.base)return reply(428,'Uppdatera appen och läs in laguppställningen innan du sparar.');
      const currentConfigs=(await rows('matchkonfiguration')).filter(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===lag&&Number(r.Matchnummer)===match);
      if(currentConfigs.length>1)return reply(409,'Dubbla matchposter finns. Inget sparades.');
      const current=currentConfigs[0]||null,entries=current?(await rows('laguppstallningar')).filter(r=>links(r.Matchkonfiguration).includes(Number(current.id))):[];
      if(JSON.stringify(lineupSnapshot(current,entries))!==JSON.stringify(body.base))return reply(409,'Laguppställningen ändrades av en annan ledare. Dina val finns kvar. Läs om innan du sparar.');
      if((current?.id||null)!==(old?.id||null))return reply(409,'Matchen har ändrats. Läs om innan du sparar.');
      if(info)configData={...data,player_count:current?.['Antal spelare']||null,goalie_player_id:links(current?.Målvakt)[0]||null,players_on_field:links(current?.['Spelare på plan'])};
     }
     if(!info&&env.NSK_MULTIUSER_ENABLED==='true')await env.AUTH_DB.prepare('UPDATE pool_flow_saves SET status=? WHERE pool_id=? AND lease=?').bind('pending',poolId,lease).run();
     const saved=await original(internal('/api/matchkonfiguration'+(old?'/'+old.id:''),old?'PATCH':'POST',configData),env,ctx);if(!saved.ok)return saved;const result=await saved.clone().json();
     if(!info){const lineup=await original(internal('/api/laguppstallningar/'+result.row.id,'POST',{players:body.players,coaches:body.coaches}),env,ctx);if(!lineup.ok)return lineup;}
     if(!info)await env.AUTH_DB.prepare('UPDATE pool_flow_saves SET status=? WHERE pool_id=? AND lag_no=? AND match_no=? AND lease=?').bind('ready',poolId,lag,match,lease).run();
     if(env.NSK_MULTIUSER_ENABLED==='true'){
      const entries=info?(await rows('laguppstallningar')).filter(r=>links(r.Matchkonfiguration).includes(Number(result.row.id))):[...body.players.map((id,i)=>({person_type:'player',person_id:id,sort_order:i+1})),...body.coaches.map((id,i)=>({person_type:'coach',person_id:id,sort_order:body.players.length+i+1}))];
      return new Response(JSON.stringify({...result,base:lineupSnapshot(result.row,entries)}),{status:saved.status,headers:saved.headers});
     }
     return saved;
    }finally{await env.AUTH_DB.prepare('UPDATE pool_flow_saves SET lease_until=0 WHERE pool_id=? AND lag_no=? AND match_no=? AND lease=?').bind(poolId,lag,match,lease).run();}
   }
   // Existing clients cannot change player membership after the first completed shift.
   if(configPath||path==='/api/matchkonfiguration'){
    const lag=Number(config?.Lagnummer||body.lag_no),match=Number(config?.Matchnummer||body.match_no);
    const shifts=(await rows('bytesschema')).filter(r=>links(r.Poolspel).includes(poolId)&&Number(r.Lagnummer)===lag&&Number(r.Matchnummer)===match);
    if(shifts.some(r=>r.Genomfört===true)){
     if(path.startsWith('/api/laguppstallningar'))return reply(409,'Matchen har genomförda byten. Uppställningen är låst.');
     const old=config||{};if(Number(old['Antal spelare'])!==Number(body.player_count)||JSON.stringify(links(old.Målvakt))!==JSON.stringify(body.goalie_player_id?[body.goalie_player_id]:[])||JSON.stringify(links(old['Spelare på plan']))!==JSON.stringify(body.players_on_field||[]))return reply(409,'Matchen har genomförda byten. Spelarna är låsta.');
    }
   }
   if(path.startsWith('/api/bytesschema')){
    const pending=await env.AUTH_DB.prepare("SELECT 1 AS pending FROM pool_flow_saves WHERE pool_id=? AND status='pending' LIMIT 1").bind(poolId).first();if(pending)return reply(409,'En laguppställning är inte färdigsparad. Spara den igen innan matchen fortsätter.');
   }
   if(path==='/api/bytesschema/retime'){
    if(req.method!=='POST'||!positive(body.lag_no)||!positive(body.match_no))return reply(400,'Ogiltig match');
    const stub=env.SHIFT_LOCK?.get(env.SHIFT_LOCK.idFromName(poolId+':'+body.lag_no+':'+body.match_no));if(!stub)return reply(503,'Matchlås saknas');
    const result=await stub.fetch('https://shift-lock.internal/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',retime:true,pool_id:poolId,lag_no:body.lag_no,match_no:body.match_no})});return new Response(result.body,{status:result.status,headers});
   }
   if(path==='/api/bytesschema/save'){
    if(body.retime!==undefined)return reply(400,'Använd omräkning av bytestid');
    if(!positive(body.lag_no)||!positive(body.match_no)||!Array.isArray(body.shifts)||body.shifts.length>200)return reply(400,'Ogiltigt bytesschema');
    const stub=env.SHIFT_LOCK?.get(env.SHIFT_LOCK.idFromName(poolId+':'+body.lag_no+':'+body.match_no));if(!stub)return reply(503,'Matchlås saknas');
    const result=await stub.fetch('https://shift-lock.internal/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,action:'save'})});return new Response(result.body,{status:result.status,headers});
   }
   const response=await original(req,env,ctx);if(response.ok&&body.schedule_only===true)await env.AUTH_DB.prepare('INSERT OR IGNORE INTO pool_flow_calendar(pool_id) VALUES(?)').bind(poolId).run();return response;
  }catch(error){return reply(503,error.message||'Poolspelsflödet kunde inte kontrolleras');}
  finally{if(operationId)await env.AUTH_DB.prepare('DELETE FROM pool_flow_operations WHERE operation_id=?').bind(operationId).run().catch(()=>{});}
 };
}
