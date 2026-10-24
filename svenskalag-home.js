// Read-only calendar section. No imports, deletes or edits are performed here.
(() => {
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function renderUpcomingCalendarPools(items){
  const box=document.getElementById('savedPoolsList');
  if(!box)return;
  const section=box.querySelector('.pool-overview-section');
  if(!section)return;
  section.querySelectorAll('[data-svenskalag-pool]').forEach(node=>node.remove());
  const title=section.querySelector('h2');
  if(!title)return;
  const existing=Array.from(section.querySelectorAll(':scope > details.nsk-pool-row')).length;
  title.textContent='Kommande poolspel ('+(existing+items.length)+')';
  const empty=section.querySelector('.listrow');
  if(empty&&items.length)empty.hidden=true;
  if(!items.length)return;
  const fragment=document.createDocumentFragment();
  for(const item of items){
   const row=document.createElement('details');
   row.className='nsk-pool-row';
   row.dataset.svenskalagPool='1';
   const summary=document.createElement('summary');
   summary.className='nsk-pool-summary';
   const name=document.createElement('span');
   name.className='nsk-pool-name';
   name.textContent=(item.place||'Poolspel')+' • '+item.date;
   const origin=document.createElement('span');
   origin.className='nsk-pool-hall';
   origin.textContent='SvenskaLag';
   const chevron=document.createElement('span');
   chevron.className='nsk-pool-chevron';
   chevron.setAttribute('aria-hidden','true');
   chevron.textContent='⌄';
   summary.append(name,origin,chevron);
   const content=document.createElement('div');
   content.className='nsk-pool-content';
   const note=document.createElement('p');
   note.textContent='Importerat från SvenskaLag. Matchschema och laguppställning är ännu inte skapade i NSK.';
   content.append(note);
   const create=document.createElement('button');
   create.type='button';
   create.className='nsk-action nsk-action--primary';
   create.textContent='Skapa och redigera poolspel';
   create.addEventListener('click',()=>{
    sessionStorage.removeItem('nsk2_edit_pool_id');
    sessionStorage.setItem('nsk2_svenskalag_pool_draft',JSON.stringify({date:item.date,place:item.place||''}));
    location.href='../skapapoolspel/';
   });
   content.append(create);
   row.append(summary,content);
   fragment.append(row);
  }
  const archived=section.nextElementSibling;
  section.append(fragment);
 }
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
   if(!items.length){root.textContent='Inga kommande kalenderaktiviteter importerade ännu.';renderUpcomingCalendarPools([]);}
   const calendarPools=items.filter(item=>item.type==='pool');
   const calendarOthers=items.filter(item=>item.type!=='pool');
   if(calendarOthers.length)root.innerHTML=calendarOthers.map(item=>{
    const kind={training:'Träning',pool:'Poolspel',match:'Match'}[item.type]||'Aktivitet';
    const detail=item.type==='match'?[item.startTime,item.opponent].filter(Boolean).join(' • '):item.type==='training'?(item.hall||'Hall ej angiven'):(item.place||'Plats ej angiven');
    return '<details class="nsk-pool-row"><summary class="nsk-pool-summary"><span class="nsk-pool-name">'+esc(kind+' • '+item.date)+'</span><span class="nsk-pool-hall">'+esc(detail)+'</span><span class="nsk-pool-chevron" aria-hidden="true">⌄</span></summary><div class="nsk-pool-content"><p>'+esc(detail)+'</p><p class="small">Källa: SvenskaLag. Kalenderuppgiften är skrivskyddad.</p></div></details>';
   }).join('');
   else root.textContent='Träningar och matcher från SvenskaLag visas här.';
   renderUpcomingCalendarPools(calendarPools);
   setTimeout(()=>{if(!document.querySelector('[data-svenskalag-pool]')&&calendarPools.length)renderUpcomingCalendarPools(calendarPools);},1200);
   const button=document.createElement('button');
   button.type='button';
   button.className='nsk-btn';
   button.textContent='Hämta SvenskaLag nu';
   button.style.marginTop='12px';
   button.addEventListener('click',async()=>{
    button.disabled=true;button.textContent='Hämtar kalender…';
    try{
     const refresh=await fetch(base+'/api/training?team_id='+encodeURIComponent(matched[0].id)+'&action=svenskalag-refresh',{method:'POST',headers,cache:'no-store'});
     if(refresh.status===403)throw Error('Du saknar behörighet att hämta kalendern');
     if(!refresh.ok)throw Error('Hämtningen misslyckades. Försök igen senare.');
     await show();
    }catch(error){
     button.disabled=false;button.textContent='Hämta SvenskaLag nu';
     const notice=document.createElement('p');notice.textContent=error.message||'Hämtningen misslyckades';
     notice.setAttribute('role','alert');button.after(notice);
    }
   });
   root.append(button);
  }catch(error){root.textContent='Kunde inte visa SvenskaLag-kalendern: '+(error.message||String(error));}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show();
})();
