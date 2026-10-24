// Read-only calendar section. No imports, deletes or edits are performed here.
(() => {
 const arenaCity=new Map([["Avicii Arena","Stockholm"],["Hovet","Stockholm"],["Scandinavium","Göteborg"],["Malmö Arena","Malmö"],["Löfbergs Arena","Karlstad"],["Monitor ERP Arena","Gävle"],["Saab Arena","Linköping"],["Husqvarna Garden","Jönköping"],["Vida Arena","Växjö"],["Behrn Arena","Örebro"],["Skellefteå Kraft Arena","Skellefteå"],["Coop Norrbotten Arena","Luleå"],["Winpos Arena","Umeå"],["Hägglunds Arena","Örnsköldsvik"],["Tegera Arena","Leksand"],["SCA Arena","Timrå"],["Catena Arena","Ängelholm"],["Be-Ge Hockey Center","Oskarshamn"],["ABB Arena Nord","Västerås"],["Nobelhallen","Karlskoga"],["Himmelstalundshallen","Norrköping"],["Stora Hallen","Nyköping"],["Plivit Arena","Västervik"],["Scaniarinken","Södertälje"],["Hatstore Arena","Kalmar"],["Liljas Arena","Nybro"],["Kristianstads Ishall","Kristianstad"],["Tyringe Kurort Arena","Tyringe"],["Halmstad Arena","Halmstad"],["Olympiarinken","Helsingborg"],["Järna Ishall","Järna"],["Visby Ishall","Visby"],["Matojärvi Ishall","Kiruna"],["Lombiahallen","Kiruna"],["Gällivare Ishall","Gällivare"],["Boden Energi Arena","Boden"],["Piteå Ishall","Piteå"],["Niphallen","Sollefteå"],["Modin開放 Ishall","Nyland"],["Kanalhallen","Härnösand"],["Brandcode Center","Sundsvall"],["Ånge Ishall","Ånge"],["Sveg Ishall","Sveg"],["Östersund Arena","Östersund"],["Strömsund Ishall","Strömsund"],["Lugnets Ishall","Falun"],["Jalas Arena","Mora"],["Smedjebacken Ishall","Smedjebacken"],["Ludvika Ishall","Ludvika"],["Avesta Ishall","Avesta"],["Hedemora Ishall","Hedemora"],["Boliden Ishall","Boliden"],["Clemensnäs Ishall","Skellefteå"],["Vännäs Ishall","Vännäs"],["Lycksele Ishall","Lycksele"],["Vilhelmina Ishall","Vilhelmina"],["Malå Ishall","Malå"],["Åsele Ishall","Åsele"],["Overkalix Ishall","Överkalix"],["Haparanda Ishall","Haparanda"],["Kalix Ishall","Kalix"],["Älvsbyn Ishall","Älvsbyn"],["Gunder Hägg-hallen","Alfta"],["Bollnäs Ishall","Bollnäs"],["Söderhamn Ishall","Söderhamn"],["Hudiksvall Ishall","Hudiksvall"],["Hofors Ishall","Hofors"],["Sandviken Ishall","Sandviken"],["Valbo Ishall","Gävle"],["Ljusne Ishall","Ljusne"],["Gränbyhallen","Uppsala"],["Enköping Ishall","Enköping"],["Bålsta Ishall","Bålsta"],["Tierp Ishall","Tierp"],["Osthammar Ishall","Östhammar"],["Hallstahammar Ishall","Hallstahammar"],["Surahammars Ishall","Surahammar"],["Sala Ishall","Sala"],["Fagersta Ishall","Fagersta"],["Arboga Ishall","Arboga"],["Köping Ishall","Köping"],["Glimma Ishall","Glimåkra"],["Osby Ishall","Osby"],["Kockumhallen","Kallinge"],["Karlskrona Arena","Karlskrona"],["Mörrum Ishall","Mörrum"],["Sölvesborg Ishall","Sölvesborg"],["Vellinge Ishall","Vellinge"],["Trelleborg Ishall","Trelleborg"],["Lunds Ishall","Lund"],["Landskrona Ishall","Landskrona"],["Åstorp Ishall","Åstorp"],["Höörs Ishall","Höör"],["Jonstorp Ishall","Jonstorp"],["Marconihallen","Göteborg"],["Ruddalens Ishall","Göteborg"],["Tuve Ishall","Göteborg"],["Angered Arena","Göteborg"],["Frölundaborg","Göteborg"],["Isdala Ishall","Göteborg"],["Wallenstamhallen","Göteborg"]].map(([arena,city])=>[arena.normalize('NFKC').trim().toLocaleLowerCase('sv-SE'),city]));
 const extraArenaCities=new Map([["Smehallen","Eskilstuna"],["Strängnäs Ishall","Strängnäs"],["Månsbrorinken","Enköping"],["Åkers Ishall","Åkers styckebruk"],["Lilla Hallen","Nyköping"]].map(([arena,city])=>[arena.normalize('NFKC').trim().toLocaleLowerCase('sv-SE'),city]));
 const poolLocation=item=>{const hall=String(item.place||item.hall||'').trim();const key=hall.normalize('NFKC').toLocaleLowerCase('sv-SE');return {hall,city:arenaCity.get(key)||extraArenaCities.get(key)||String(item.city||item.stad||'').trim()||hall};};
 const samePool=(p,item)=>p.pool_date===item.date&&String(p.place||'').trim().toLocaleLowerCase('sv-SE')===poolLocation(item).city.toLocaleLowerCase('sv-SE')&&(!p.hall||String(p.hall).trim().toLocaleLowerCase('sv-SE')===poolLocation(item).hall.toLocaleLowerCase('sv-SE'));
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
   name.textContent=(poolLocation(item).city||'Poolspel')+' • '+item.date;
   const origin=document.createElement('span');
   origin.className='nsk-pool-hall';
   origin.textContent=poolLocation(item).hall||'Ishall ej angiven';
   const chevron=document.createElement('span');
   chevron.className='nsk-pool-chevron';
   chevron.setAttribute('aria-hidden','true');
   chevron.textContent='⌄';
   summary.append(name,origin,chevron);
   const content=document.createElement('div');
   content.className='nsk-pool-content';
   const note=document.createElement('p');
   note.textContent='Importerat från SvenskaLag. Matchschema och laguppställning är ännu inte skapade i NSK.';
   note.className='small';
   note.textContent='Källa: SvenskaLag. Skapa poolspelet i NSK för att använda laguppställning och bytesschema.';
   content.append(note);
   const actions=document.createElement('div');
   actions.className='nsk-pool-actions';
   const create=document.createElement('button');
   create.type='button';
   create.className='start-pool-btn nsk-action nsk-action--primary nsk-action--wide';
   create.textContent='Skapa och redigera poolspel';
   create.addEventListener('click',async()=>{
    create.disabled=true;
    try{
     const pools=await DB.listPools();
     const match=pools.find(p=>samePool(p,item));
     if(match){sessionStorage.setItem('nsk2_edit_pool_id',String(match.id));location.href='../skapapoolspel/';return;}
    }catch(error){create.disabled=false;alert('Kunde inte kontrollera befintliga poolspel. Försök igen.');return;}

    sessionStorage.removeItem('nsk2_edit_pool_id');
    sessionStorage.setItem('nsk2_svenskalag_pool_draft',JSON.stringify({date:item.date,place:poolLocation(item).city,hall:poolLocation(item).hall}));
    location.href='../skapapoolspel/';
   });
   actions.append(create);
   content.append(actions);
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
   let existingPools=[];
   try{existingPools=await DB.listPools();}catch{}
   const calendarPools=items.filter(item=>item.type==='pool'&&!existingPools.some(p=>samePool(p,item)));
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
