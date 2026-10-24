// Read-only calendar section. No imports, deletes or edits are performed here.
(() => {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function show(){
  const root=document.getElementById('svenskalagSavedEvents');
  if(!root)return;
  try{
   await Auth.init();
   const team=Auth.activeTeam(),token=Auth.getToken();
   if(team!=='NSK Team 18'){root.textContent='Kalendern gäller NSK Team 18.';return;}
   if(!token){root.textContent='Logga in för att se kalendern.';return;}
   const base=String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
   const headers={Authorization:'Bearer '+token};
   const response=await fetch(base+'/api/lag',{headers,cache:'no-store'});
   if(!response.ok)throw Error('Kunde inte läsa lag');
   const data=await response.json();
   const teams=Array.isArray(data.results)?data.results:Array.isArray(data)?data:[];
   const matched=teams.filter(t=>t.Namn===team&&String(t['Säsong'])==='2026');
   if(matched.length!==1)throw Error('Lagkopplingen saknas');
   const events=await fetch(base+'/api/training?team_id='+encodeURIComponent(matched[0].id)+'&action=svenskalag-saved',{headers,cache:'no-store'});
   if(!events.ok)throw Error('Kalendern kunde inte läsas');
   const result=await events.json(),items=Array.isArray(result.items)?result.items:[];
   if(!items.length){root.textContent='Inga kommande kalenderaktiviteter importerade ännu.';return;}
   root.innerHTML=items.map(item=>{
    const kind={training:'Träning',pool:'Poolspel',match:'Match'}[item.type]||'Aktivitet';
    const detail=item.type==='match'?[item.startTime,item.opponent].filter(Boolean).join(' • '):item.type==='training'?(item.hall||'Hall ej angiven'):(item.place||'Plats ej angiven');
    return '<details class="nsk-pool-row"><summary class="nsk-pool-summary"><span class="nsk-pool-name">'+esc(kind+' • '+item.date)+'</span><span class="nsk-pool-hall">'+esc(detail)+'</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><p>'+esc(detail)+'</p><p class="small">Källa: SvenskaLag. Kalenderuppgiften är skrivskyddad.</p></div></details>';
   }).join('');
  }catch(error){root.textContent='Kunde inte visa SvenskaLag-kalendern: '+(error.message||String(error));}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
})();
