// Shared training client: only confirmed attendance IDs, never image/OCR data.
(() => {
  const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
  let teamId;
  let cachedTeamName;
  async function resolveTeam(){
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
  window.SharedTraining={list:()=>request(),get:date=>request(date),save:(date,data)=>request(date,data),remove,
    listPlayers:()=>roster('spelare'),listCoaches:()=>roster('tranare')};
})();
