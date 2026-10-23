// Saved training sessions are fetched from team-scoped shared storage.
(() => {
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
      const teams=Array.isArray(teamData.results)?teamData.results:Array.isArray(teamData)?teamData:[];
      const matches=teams.filter(t=>t.Namn===team&&String(t['Säsong'])==='2026');
      if(matches.length!==1)throw Error('Lagkopplingen saknas');
      const response=await fetch(base+'/api/training?team_id='+encodeURIComponent(matches[0].id),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
      if(!response.ok)throw Error('Gemensamma träningar är ännu inte aktiverade');
      const data=await response.json();
      const sessions=Array.isArray(data.sessions)?data.sessions:[];
      sessions.sort((a,b)=>b.date.localeCompare(a.date));
      if(!sessions.length){root.textContent='Inga gemensamt sparade träningar ännu.';return;}
      root.innerHTML=sessions.map(s=>{
        const day=new Date(s.date+'T12:00:00');
        const weekday=Number.isNaN(day.getTime())?'Träning':day.toLocaleDateString('sv-SE',{weekday:'long'});
        const title=weekday.charAt(0).toLocaleUpperCase('sv-SE')+weekday.slice(1);
        const hall=['Lilla Hallen','Stora hallen'].includes(s.hall)?s.hall:'Hall ej vald';
        return '<details class="nsk-pool-row" data-date="'+encodeURIComponent(s.date)+'"><summary class="nsk-pool-summary"><span class="nsk-pool-name">'+escapeHtml(title+' • '+s.date)+'</span><span class="nsk-pool-hall">'+escapeHtml(hall)+'</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><p data-training-info>Öppna för att visa träningsuppgifter.</p><div class="nsk-pool-actions"><a class="home-create-button" href="../traningsgrupper/?date='+encodeURIComponent(s.date)+'">Visa / redigera träning</a></div></div></details>';}).join('');
      root.addEventListener('toggle',async event=>{
        const details=event.target;
        if(!(details instanceof HTMLDetailsElement)||!details.open||details.dataset.loaded==='pending')return;
        const date=details.dataset.date;
        const info=details.querySelector('[data-training-info]');
        if(!info||!date)return;
        details.dataset.loaded='pending';
        info.textContent='Hämtar träningsuppgifter…';
        try{
          const response=await fetch(base+'/api/training?team_id='+encodeURIComponent(matches[0].id)+'&date='+encodeURIComponent(date),{headers:{Authorization:'Bearer '+token},cache:'no-store'});
          if(!response.ok)throw Error('Kunde inte hämta träningen');
          const data=await response.json();
          const session=data.session;
          if(!session)throw Error('Träningen finns inte längre');
          const groups=Array.isArray(session.allocation)?session.allocation.length:0;
          info.textContent=(session.selected||[]).length+' spelare • '+(session.selectedCoaches||[]).length+' tränare • '+(Number(session.goalieCount)||0)+' målvakter • '+groups+' grupper';
          delete details.dataset.loaded;
        }catch(error){delete details.dataset.loaded;info.textContent=error.message||'Kunde inte hämta träningsuppgifter';}
      },true);
    }catch(error){root.textContent='Kunde inte läsa sparade träningar: '+(error.message||String(error));}
  }
  document.addEventListener('DOMContentLoaded',render);
})();
