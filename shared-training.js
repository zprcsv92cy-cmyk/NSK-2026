// Shared training client: only confirmed attendance IDs, never image/OCR data.
(() => {
  const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
  let teamId;
  async function resolveTeam(){
    if(teamId)return teamId;
    if(!Auth.activeTeam())throw Error('Välj ett lag');
    const token=Auth.getToken();
    if(!token)throw Error('Logga in först');
    const r=await fetch(base()+'/api/lag',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(!r.ok)throw Error('Lag kunde inte hämtas');
    const data=await r.json();
    const teams=Array.isArray(data.results)?data.results:Array.isArray(data)?data:[];
    const matches=teams.filter(t=>t.Namn===Auth.activeTeam()&&String(t['Säsong'])==='2026');
    if(matches.length!==1)throw Error('Lagkopplingen kunde inte verifieras');
    teamId=String(matches[0].id);
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
  window.SharedTraining={list:()=>request(),get:date=>request(date),save:(date,data)=>request(date,data)};
})();
