// Saved training sessions are local to this browser and scoped to the active team.
(() => {
  const prefix='nsk_training_v1:';
  const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function render(){
    const root=document.getElementById('savedTrainingsList');
    if(!root)return;
    try{
      await Auth.init();
      const team=Auth.activeTeam();
      if(!team){root.textContent='Välj lag under Mitt konto för att se träningar.';return;}
      const token=Auth.getToken();
      if(!token)throw Error('Logga in först');
      const base=String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
      const teamResponse=await fetch(base+'/api/lag',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!teamResponse.ok)throw Error('Kunde inte läsa lag');
      const teamData=await teamResponse.json();
      const teams=Array.isArray(teamData.results)?teamData.results:[];
      const matches=teams.filter(t=>t.Namn===team&&String(t['Säsong'])==='2026');
      if(matches.length!==1)throw Error('Lagkopplingen saknas');
      const response=await fetch(base+'/api/training?team_id='+encodeURIComponent(matches[0].id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!response.ok)throw Error('Gemensamma träningar är ännu inte aktiverade');
      const data=await response.json();
      const sessions=Array.isArray(data.sessions)?data.sessions:[];
      sessions.sort((a,b)=>b.date.localeCompare(a.date));
      if(!sessions.length){root.textContent='Inga gemensamt sparade träningar ännu.';return;}
      root.innerHTML=sessions.map(s=>'<details class="nsk-pool-row"><summary class="nsk-pool-summary"><span class="nsk-pool-name">Träning • '+escapeHtml(s.date)+'</span><span class="nsk-pool-hall">'+s.players+' spelare, '+s.coaches+' tränare</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><div class="nsk-pool-actions"><a class="home-create-button" href="../traningsgrupper/?date='+encodeURIComponent(s.date)+'">Visa / redigera träning</a></div></div></details>').join('');
    }catch(error){root.textContent='Kunde inte läsa sparade träningar: '+(error.message||String(error));}
  }
  document.addEventListener('DOMContentLoaded',render);
})();
