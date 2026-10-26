// Shared training client: only confirmed attendance IDs, never image/OCR data.
(() => {
  const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
  let teamId;
  let cachedTeamName;
  let pendingTeam=null;
  function resolveTeam(){
    const key=JSON.stringify([Auth.activeTeam(),Auth.getToken()]);
    if(pendingTeam?.key===key)return pendingTeam.promise;
    const promise=loadTeam();const entry={key,promise};pendingTeam=entry;
    const clear=()=>{if(pendingTeam===entry)pendingTeam=null;};promise.then(clear,clear);
    return promise;
  }
  async function loadTeam(){
    const activeTeam=Auth.activeTeam();
    if(teamId&&cachedTeamName===activeTeam)return teamId;
    teamId=undefined;
    if(!activeTeam)throw Error('Välj ett lag');
    const token=Auth.getToken();
    if(!token)throw Error('Logga in först');
    const r=await fetch(base()+'/api/lag',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!r.ok)throw Error('Lag kunde inte hämtas');
    const data=await r.json();
    const teams=Array.isArray(data.results)?data.results:Array.isArray(data)?data:[];
    const matches=teams.filter(t=>t.Namn===Auth.activeTeam()&&String(t['Säsong'])==='2026');
    if(matches.length!==1)throw Error('Lagkopplingen kunde inte verifieras');
    teamId=String(matches[0].id);
    cachedTeamName=activeTeam;
    return teamId;
  }
  async function request(date,payload){
    const team=await resolveTeam();
    const url=base()+'/api/training?team_id='+encodeURIComponent(team)+(date?'&date='+encodeURIComponent(date):'');
    const headers={Authorization:'Bearer '+Auth.getToken()};
    if(payload!==undefined)headers['Content-Type']='application/json';
    const response=await fetch(url,{method:payload===undefined?'GET':'PUT',headers,body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(response.status===409?'Träningen ändrades av en annan ledare. Ladda om sidan.':data.error||'Träningen kunde inte sparas.');
    if(payload!==undefined){window.NSKViewCache?.clear();try{sessionStorage.removeItem('nsk_view_cache_v1');}catch{}}
    return data;
  }
  async function remove(date,revision){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isSafeInteger(revision)||revision<1)
      throw Error('Träningen behöver läsas om innan den kan tas bort.');
    const id=await resolveTeam();
    const response=await fetch(base()+'/api/training?team_id='+encodeURIComponent(id)+'&date='+encodeURIComponent(date)+'&revision='+revision,{
      method:'DELETE',headers:{Authorization:'Bearer '+Auth.getToken()},cache:'no-store'
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(response.status===409?'Träningen har ändrats eller tagits bort av någon annan. Ladda om sidan.':data.error||'Träningen kunde inte tas bort.');
    window.NSKViewCache?.clear();try{sessionStorage.removeItem('nsk_view_cache_v1');}catch{}
    return data;
  }
  async function roster(kind){
    if(!['spelare','tranare'].includes(kind))throw Error('Ogiltig trupptyp');
    const id=await resolveTeam();
    const token=Auth.getToken();
    const result=[];
    for(let page=1;page<=100;page++){
      const response=await fetch(base()+'/api/'+kind+'?page='+page+'&size=200&team_id='+encodeURIComponent(id),{
        headers:{Authorization:'Bearer '+token},cache:'no-store'
      });
      if(!response.ok)throw Error('Kunde inte hämta '+(kind==='spelare'?'spelare':'tränare')+': '+response.status);
      const data=await response.json();
      if(!data.ok||!Array.isArray(data.results))throw Error('Ogiltigt truppsvar');
      for(const person of data.results){
        const teams=Array.isArray(person.Lag)?person.Lag:[];
        if(!teams.some(team=>String(typeof team==='object'?team.id:team)===id))continue;
        result.push({id:person.id,full_name:person.Namn,team_id:id});
      }
      if(!data.next)return result.sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'sv'));
    }
    throw Error('För många sidor i truppsvaret');
  }
  async function listEquipment(){
    const id=await resolveTeam();
    const response=await fetch(base()+'/api/lagpersonal?team_id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+Auth.getToken()},cache:'no-store'});
    const data=await response.json();
    if(!response.ok||!data.ok)throw Error('Materialförvaltare kunde inte hämtas');
    return (data.results||[]).filter(person=>['equipment','Materialförvaltare'].includes(person.role)).map(person=>({id:String(person.id),full_name:person.name})).sort((a,b)=>a.full_name.localeCompare(b.full_name,'sv'));
  }
  async function calendarTrainings(){
    if(Auth.activeTeam()!=='NSK Team 18')return [];
    const id=await resolveTeam();
    const response=await fetch(base()+'/api/training?team_id='+encodeURIComponent(id)+'&action=svenskalag-saved&training_history=1',{headers:{Authorization:'Bearer '+Auth.getToken()},cache:'no-store'});
    if(!response.ok)throw Error('Kalendern kunde inte hämtas');
    const data=await response.json();
    return (Array.isArray(data.items)?data.items:[]).filter(item=>item.type==='training');
  }
  function upcomingDates(items,today){
    const dates=new Map();
    for(const item of items){
      if(item.type!=='training'||!/^\d{4}-\d{2}-\d{2}$/.test(item.date)||item.date<today)continue;
      const labels=dates.get(item.date)||[];
      const detail=[item.startTime,item.hall||item.place].filter(Boolean).join(' ');
      if(detail&&!labels.includes(detail))labels.push(detail);
      dates.set(item.date,labels);
    }
    return [...dates].sort(([a],[b])=>a.localeCompare(b)).map(([date,details])=>({date,label:date+(details.length?' · '+details.join(' / '):'')}));
  }
  async function calendarHall(date){
    if(Auth.activeTeam()!=='NSK Team 18')return '';
    const id=await resolveTeam();
    const response=await fetch(base()+'/api/training?team_id='+encodeURIComponent(id)+'&action=svenskalag-saved',{headers:{Authorization:'Bearer '+Auth.getToken()},cache:'no-store'});
    if(!response.ok)throw Error('Kalendern kunde inte hämtas');
    const data=await response.json();
    const halls=new Set((Array.isArray(data.items)?data.items:[]).filter(item=>item.type==='training'&&item.date===date).map(item=>{
      const hall=String(item.hall||item.place||'').trim().toLocaleLowerCase('sv-SE');
      return /^(lilla hallen|lilla ishallen)$/.test(hall)?'Lilla Hallen':/^(stora hallen|stora ishallen)$/.test(hall)?'Stora hallen':'';
    }));
    return halls.size===1?[...halls][0]:'';
  }
  window.SharedTraining={listEquipment,upcomingDates,calendarTrainings,calendarHall,list:()=>request(),get:date=>request(date),save:(date,data)=>request(date,data),remove,
    listPlayers:()=>roster('spelare'),listCoaches:()=>roster('tranare')};
})();
