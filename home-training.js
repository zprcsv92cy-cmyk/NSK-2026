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
      const data=await SharedTraining.list();
      const sessions=Array.isArray(data.sessions)?data.sessions:[];
      sessions.sort((a,b)=>b.date.localeCompare(a.date));
      if(!sessions.length){root.textContent='Inga gemensamt sparade träningar ännu.';return;}
      root.innerHTML=sessions.map(s=>'<details class="nsk-pool-row"><summary class="nsk-pool-summary"><span class="nsk-pool-name">Träning • '+escapeHtml(s.date)+'</span><span class="nsk-pool-hall">'+s.players+' spelare, '+s.coaches+' tränare</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><div class="nsk-pool-actions"><a class="home-create-button" href="../traningsgrupper/?date='+encodeURIComponent(s.date)+'">Visa / redigera träning</a></div></div></details>').join('');
    }catch(error){root.textContent='Kunde inte läsa sparade träningar: '+(error.message||String(error));}
  }
  document.addEventListener('DOMContentLoaded',render);
})();
