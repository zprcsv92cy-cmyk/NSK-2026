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
      const keyPrefix=prefix+team+':';
      const sessions=[];
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(!key||!key.startsWith(keyPrefix))continue;
        const date=key.slice(keyPrefix.length);
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
        try{
          const data=JSON.parse(localStorage.getItem(key));
          if(!data||typeof data!=='object')continue;
          sessions.push({date,players:Array.isArray(data.selected)?data.selected.length:0,coaches:Array.isArray(data.selectedCoaches)?data.selectedCoaches.length:0});
        }catch{}
      }
      sessions.sort((a,b)=>b.date.localeCompare(a.date));
      if(!sessions.length){root.textContent='Inga sparade träningar i den här webbläsaren ännu.';return;}
      root.innerHTML=sessions.map(s=>'<details class="nsk-pool-row"><summary class="nsk-pool-summary"><span class="nsk-pool-name">Träning • '+escapeHtml(s.date)+'</span><span class="nsk-pool-hall">'+s.players+' spelare, '+s.coaches+' tränare</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><div class="nsk-pool-actions"><a class="home-create-button" href="../traningsgrupper/?date='+encodeURIComponent(s.date)+'">Visa / redigera träning</a></div></div></details>').join('');
    }catch(error){root.textContent='Kunde inte läsa sparade träningar: '+(error.message||String(error));}
  }
  document.addEventListener('DOMContentLoaded',render);
})();
