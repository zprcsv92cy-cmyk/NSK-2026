// A single shared navigation for every app view.
(() => {
  const entries = [
    ['startsida','Kalender'],['truppen','Truppen'],['traningsgrupper','Träningsplanering'],
    ['ovningsarkiv','Övningsarkiv'],['ritverktyg','Ritverktyg'],
    ['skapapoolspel','Skapa poolspel'],['malvaktsstatistik','Statistik'],
    ['materialforvaltare','Materialförvaltare'],['mittkonto','Mitt konto']
  ];

  // Account-scoped cache holds only presentation settings, never credentials.
  const menuDefaults=['startsida','truppen','traningsgrupper'];
  const menuLabels={startsida:'Kalender',truppen:'Truppen',traningsgrupper:'Planering',ovningsarkiv:'Övningsarkiv',ritverktyg:'Ritverktyg',malvaktsstatistik:'Statistik',materialforvaltare:'Material',mittkonto:'Mitt konto',anvandare:'Användare'};
  const menuIcons={startsida:'calendar',truppen:'shirt',traningsgrupper:'plan',ovningsarkiv:'case',ritverktyg:'sticks',malvaktsstatistik:'plan',materialforvaltare:'skate',mittkonto:'person',anvandare:'group'};
  const menuBase=()=>String(window.APP_CONFIG?.AUTH_URL||'').replace(/\/$/,'');
  const menuScope=()=>{const id=window.Auth?.getSession?.()?.user?.id;return id&&menuBase()?'nsk_menu_v1:'+JSON.stringify([menuBase(),id]):'';};
  function menuChoices(){const session=window.Auth?.getSession?.();return ['startsida','truppen','traningsgrupper','ovningsarkiv','ritverktyg','malvaktsstatistik','materialforvaltare','mittkonto',...(session?.permissions?.includes('users:manage')?['anvandare']:[])];}
  function normalizeMenu(value){const allowed=menuChoices(),out=[];for(const slug of [...(Array.isArray(value)?value:[]),...menuDefaults,...allowed])if(allowed.includes(slug)&&!out.includes(slug)&&out.length<3)out.push(slug);return out;}
  function cachedMenu(){try{const value=JSON.parse(localStorage.getItem(menuScope())||'null');if(value&&Number.isSafeInteger(value.revision)&&value.revision>=0)return {shortcuts:normalizeMenu(value.shortcuts),revision:value.revision};}catch{}return {shortcuts:[...menuDefaults],revision:0};}
  let menuState={shortcuts:[...menuDefaults],revision:0},loadedScope='',menuVerified=false,menuLoading=null,menuLastRead=0,currentPage='',menuSaving=false,menuDraft=null,menuDirty=false,menuConflict=false,menuNotice='';
  const menuCopy=()=>({shortcuts:[...menuState.shortcuts],revision:menuState.revision});
  function cacheMenu(value){menuState={shortcuts:normalizeMenu(value.shortcuts),revision:value.revision};try{localStorage.setItem(menuScope(),JSON.stringify(menuState));}catch{}}
  async function menuRequest(method,payload){
   const response=await fetch(menuBase()+'/api/auth/navigation',{method,headers:{Authorization:'Bearer '+window.Auth.getToken(),...(payload?{'Content-Type':'application/json'}:{})},credentials:'omit',cache:'no-store',...(typeof AbortSignal!=='undefined'&&AbortSignal.timeout?{signal:AbortSignal.timeout(12000)}:{}),...(payload?{body:JSON.stringify(payload)}:{})});
   const value=await response.json().catch(()=>({}));
   if(!response.ok){const error=Error(value.error||'Menyinställningarna kunde inte hämtas. Försök igen.');error.status=response.status;throw error;}
   if(!Array.isArray(value.shortcuts)||value.shortcuts.length!==3||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('Kontots meny kunde inte läsas.');
   return value;
  }
  function paintMenu(){
   const old=document.querySelector('.arena-bottom');if(!old)return;
   const signature=JSON.stringify([normalizeMenu(menuState.shortcuts),menuChoices(),currentPage]);if(old.dataset.menuSignature===signature)return;
   const bottom=document.createElement('nav');bottom.className='arena-bottom';bottom.dataset.menuSignature=signature;bottom.setAttribute('aria-label','Huvudnavigation');
   const shortcuts=normalizeMenu(menuState.shortcuts);
   for(const slug of shortcuts){const link=document.createElement('a');link.href='../'+slug+'/';link.innerHTML='<span aria-hidden="true">'+svgIcon(menuIcons[slug])+'</span>';link.append(document.createTextNode(menuLabels[slug]));if(slug===currentPage){link.className='active';link.setAttribute('aria-current','page');}bottom.append(link);}
   const more=document.createElement('details');more.className='arena-more';const summary=document.createElement('summary');summary.innerHTML='<span aria-hidden="true">•••</span>Mer';more.append(summary);
   const list=document.createElement('div');list.className='arena-more-menu';
   for(const [slug,label] of entries.concat(menuChoices().includes('anvandare')?[['anvandare','Användare']]:[])){if(shortcuts.includes(slug)||slug==='skapapoolspel')continue;const link=document.createElement('a');link.href='../'+slug+'/';link.textContent=label;if(slug===currentPage){link.className='active';link.setAttribute('aria-current','page');summary.classList.add('active');}list.append(link);}
   more.append(list);bottom.append(more);old.replaceWith(bottom);
  }
  function mountMenuEditor(){
   if(!document.getElementById('accountDetails')||document.getElementById('menuPreferences'))return;
   const section=document.createElement('section');section.className='card menu-preferences';section.id='menuPreferences';
   section.innerHTML='<h2>Anpassa nedre menyn</h2><p class="small">Välj tre snabbval. Mer ligger alltid sist.</p><form id="menuPreferencesForm"><div id="menuPreferenceRows"></div><p class="small">Förhandsvisning</p><div id="menuPreferencePreview" class="menu-preference-preview" aria-label="Förhandsvisning av nedre menyn"></div><div class="menu-preference-actions"><button id="menuPreferencesSave" class="nsk-action nsk-action--save" type="submit">Spara</button><button id="menuPreferencesReset" type="button">Återställ standard</button><button id="menuPreferencesReload" type="button" hidden>Ladda om inställningar</button></div><p id="menuPreferencesStatus" role="status" aria-live="polite"></p></form>';
   document.getElementById('accountDetails').closest('section').after(section);
   const style=document.createElement('style');style.textContent='.menu-preferences{max-width:650px;margin:18px auto}.menu-preference-row{display:grid;grid-template-columns:minmax(0,1fr) 44px 44px;gap:8px;align-items:end;margin:12px 0}.menu-preference-row label{display:grid;gap:5px;font-size:.85rem;min-width:0}.menu-preference-row select{width:100%;min-width:0;box-sizing:border-box}.menu-preference-row button{width:44px;height:44px;margin:0;padding:0;font-size:22px}.menu-preference-preview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border:1px solid #3b5166;border-radius:10px;overflow:hidden;background:#0b1722}.menu-preference-preview>span{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:70px;text-align:center;font-size:10px;padding:6px 2px;overflow-wrap:anywhere}.menu-preference-preview svg{width:24px;height:24px}.menu-preference-preview>span:first-child{color:#ff3d5f}.menu-preference-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.menu-preference-actions button{min-height:44px;margin:0}.menu-preferences [hidden]{display:none!important}';document.head.append(style);
   menuDraft=[...menuState.shortcuts];
   section.querySelector('form').addEventListener('submit',event=>{event.preventDefault();void saveMenuDraft();});
   document.getElementById('menuPreferencesReset').addEventListener('click',()=>{if(menuSaving)return;menuDraft=[...menuDefaults];menuDirty=true;window.NSKShellHost?.dirty(window);menuNotice='Standardmenyn är vald. Tryck Spara för att använda den.';renderMenuEditor();});
   document.getElementById('menuPreferencesReload').addEventListener('click',()=>{menuDirty=false;menuConflict=false;menuNotice='';window.NSKShellHost?.clean(window);void syncMenu(true);});
   renderMenuEditor();
  }
  function renderMenuEditor(){
   const rows=document.getElementById('menuPreferenceRows');if(!rows)return;
   if(!menuDraft||!menuDirty)menuDraft=[...menuState.shortcuts];
   rows.replaceChildren();
   menuDraft.forEach((slug,index)=>{
    const row=document.createElement('div');row.className='menu-preference-row';const label=document.createElement('label');label.textContent='Plats '+(index+1);const select=document.createElement('select');select.setAttribute('aria-label','Snabbval på plats '+(index+1));select.disabled=menuSaving||!menuVerified;
    for(const choice of menuChoices()){const option=document.createElement('option');option.value=choice;option.textContent=menuLabels[choice];option.disabled=choice!==slug&&menuDraft.includes(choice);select.append(option);}select.value=slug;label.append(select);row.append(label);
    select.addEventListener('change',()=>{menuDraft[index]=select.value;menuDirty=true;window.NSKShellHost?.dirty(window);menuNotice='';renderMenuEditor();document.querySelectorAll('#menuPreferenceRows select')[index]?.focus();});
    for(const [delta,arrow] of [[-1,'↑'],[1,'↓']]){const button=document.createElement('button');button.type='button';button.textContent=arrow;button.setAttribute('aria-label','Flytta '+menuLabels[slug]+' '+(delta<0?'upp':'ned'));button.disabled=menuSaving||!menuVerified||index+delta<0||index+delta>2;button.addEventListener('click',()=>{[menuDraft[index],menuDraft[index+delta]]=[menuDraft[index+delta],menuDraft[index]];menuDirty=true;window.NSKShellHost?.dirty(window);menuNotice='';renderMenuEditor();document.querySelectorAll('#menuPreferenceRows select')[index+delta]?.focus();});row.append(button);}
    rows.append(row);
   });
   const preview=document.getElementById('menuPreferencePreview');preview.replaceChildren();for(const slug of [...menuDraft,'more']){const item=document.createElement('span');item.innerHTML=slug==='more'?'<span aria-hidden="true">•••</span>':svgIcon(menuIcons[slug]);const text=document.createElement('span');text.textContent=slug==='more'?'Mer':menuLabels[slug];item.append(text);preview.append(item);}
   document.getElementById('menuPreferencesSave').disabled=menuSaving||!menuVerified||!menuDirty;
   document.getElementById('menuPreferencesReset').disabled=menuSaving||!menuVerified;
   document.getElementById('menuPreferencesReload').hidden=menuVerified||!!menuLoading;
   document.getElementById('menuPreferencesReload').disabled=menuSaving;
   document.getElementById('menuPreferencesStatus').textContent=menuNotice||(!menuVerified?'Hämtar kontots meny…':'');
  }
  async function syncMenu(force=false){
   const scope=menuScope();if(!scope)return;
   if(menuLoading)return menuLoading;
   if(!force&&scope===loadedScope&&Date.now()-menuLastRead<60000)return;
   if(scope!==loadedScope){loadedScope=scope;menuState=cachedMenu();menuVerified=false;menuDirty=false;menuConflict=false;menuDraft=null;paintMenu();}
   const before=JSON.stringify(cachedMenu()),session=window.Auth.getToken();
   const run=(async()=>{try{
    const data=await menuRequest('GET');
    if(menuScope()!==scope||window.Auth.getToken()!==session)return;
    if(before!==JSON.stringify(cachedMenu())){menuState=cachedMenu();menuVerified=false;menuConflict=menuDirty;menuNotice='Menyn uppdaterades i en annan flik. Ladda om inställningarna.';return;}
    if(menuDirty&&data.revision!==menuState.revision){menuConflict=true;menuNotice='Menyn har ändrats på en annan enhet. Ladda om inställningarna.';}
    cacheMenu(data);menuVerified=!menuConflict;menuLastRead=Date.now();paintMenu();if(!menuDirty){menuDraft=[...menuState.shortcuts];menuNotice='';}
   }catch(error){if(menuScope()===scope){menuVerified=false;menuNotice=error.message;}}
   finally{menuLoading=null;if(menuScope()===scope)renderMenuEditor();}
   })();menuLoading=run;renderMenuEditor();return run;
  }
  async function saveMenuDraft(){
   if(menuSaving||!menuVerified||!menuDirty)return;
   const scope=menuScope(),session=window.Auth.getToken(),shortcuts=[...menuDraft],revision=menuState.revision;
   menuSaving=true;menuNotice='Sparar…';renderMenuEditor();
   try{const data=await menuRequest('PUT',{shortcuts,revision});if(menuScope()!==scope||window.Auth.getToken()!==session)return;cacheMenu(data);menuDirty=false;window.NSKShellHost?.clean(window);menuNotice='Menyn är sparad för ditt konto.';paintMenu();}
   catch(error){if(menuScope()===scope){menuNotice=error.message;if(error.status===409){menuVerified=false;menuConflict=true;}}}
   finally{menuSaving=false;if(menuScope()===scope)renderMenuEditor();}
  }
  window.NSKMenuPreferences={choices:menuChoices,normalize:normalizeMenu,cacheKey:menuScope,readCache:cachedMenu};
  window.addEventListener('storage',event=>{if(event.key!==menuScope()||!loadedScope)return;menuState=cachedMenu();paintMenu();if(menuDirty){menuVerified=false;menuConflict=true;menuNotice='Menyn har ändrats i en annan flik. Ladda om inställningarna.';}renderMenuEditor();});
  window.addEventListener('focus',()=>{if(loadedScope)void syncMenu();});

  const iconPaths={"shirt":"<path d=\"m8 3-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3-2 2h-2z\"/>","mask":"<path d=\"M12 2c-5 0-8 4-8 9 0 6 4 11 8 11s8-5 8-11c0-5-3-9-8-9Z\"/><path d=\"M5 9h14M5 13h14M8 5v12m8-12v12M8 17h8m-4-8v12M9 4l3 3 3-3\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 2v6m10-6v6M3 11h18\"/>","image":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><path d=\"m3 17 6-6 4 4 3-3 5 5\"/>","person":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2Z\"/>","group":"<circle cx=\"9\" cy=\"7\" r=\"3\"/><path d=\"M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2\"/>","case":"<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 7V3h8v4M3 12h18m-12 0v4h6v-4\"/>","plan":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"18\" rx=\"2\"/><rect x=\"9\" y=\"2\" width=\"6\" height=\"4\" rx=\"1\"/><path d=\"M9 11h6m-6 4h6m-6 4h4\"/>"};
  function svgIcon(name){return '<svg class="arena-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+iconPaths[name]+'</svg>';}
  iconPaths.skate='<path d="M5 3h5l1 7 7 3v4H4V9h1zM3 21h17l2-2M7 17v4m10-4v4M7 6h3m-3 3h4"/>';
  iconPaths.sticks='<path d="m4 3 11 17h5v-3h-3L7 3M20 3 9 20H4v-3h3L17 3"/>';
  let iconObserver;
  function decorateIcons(){
    const attach=(element,name,replace=false)=>{if(!element||element.dataset.arenaIcon)return;element.dataset.arenaIcon=name;if(replace)element.innerHTML=svgIcon(name);else element.insertAdjacentHTML('afterbegin',svgIcon(name));};
    for(const [id,name] of Object.entries({trainingGoalieCount:'mask',trainingShirtColorCount:'shirt',trainingCalendar:'calendar',trainingHall:'case'}))attach(document.getElementById(id)?.closest('label'),name);
    for(const [id,name] of Object.entries({trainingGroupButton:'shirt',trainingPrintButton:'plan',trainingImportRead:'image'}))attach(document.getElementById(id),name);
    attach(document.querySelector('.training-import>summary'),'image');
    for(const link of document.querySelectorAll('.mainmenu a')){const slug=link.getAttribute('href')?.split('/').filter(Boolean).at(-1);const name={startsida:'calendar',truppen:'shirt',traningsgrupper:'plan',materialforvaltare:'skate',mittkonto:'person',ritverktyg:'sticks',malvaktsstatistik:'plan',ovningsarkiv:'case',anvandare:'group',skapapoolspel:'calendar'}[slug];if(name)attach(link,name);}
    for(const name of document.querySelectorAll('#activityList .nsk-pool-name')){if(name.querySelector('.arena-activity-icon'))continue;const span=document.createElement('span');span.className='arena-activity-icon';span.setAttribute('aria-hidden','true');span.innerHTML=svgIcon(name.closest('[data-date]')?'calendar':'sticks');name.prepend(span);}

    for(const heading of document.querySelectorAll('.training-page h2')){
      const name={'Spelare':'person','Tränare':'group','Materialförvaltare':'case','Målvakter':'mask','Tröjfärger':'shirt'}[heading.textContent.trim()];
      if(name)attach(heading,name);
    }
    for(const button of document.querySelectorAll('.nsk-training-function')){
      attach(button.querySelector('span'),button.hasAttribute('data-training-colors')?'shirt':'plan',true);
    }
    for(const [slug,name] of Object.entries({startsida:'calendar',truppen:'shirt',traningsgrupper:'plan'}))attach(document.querySelector('.arena-bottom>a[href="../'+slug+'/"]>span'),name,true);
  }
  // The shell hosts editors in an iframe. Safari pans the outer viewport when
  // their keyboard opens, so checking only the outer activeElement is insufficient.
  function editingViewport(doc=document){
    try{
      const element=doc.activeElement;
      if(element?.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return true;
      if(element?.tagName==='IFRAME')return element.contentDocument?editingViewport(element.contentDocument):true;
    }catch{return true;}
    return false;
  }
  let viewportBound=false;
  function bindMobileViewport(){
    if(viewportBound)return;viewportBound=true;
    let frame=0;
    const sync=()=>{
      frame=0;
      const height=Math.round(window.innerHeight)+'px';
      if(document.documentElement.style.getPropertyValue('--nsk-app-height')!==height)document.documentElement.style.setProperty('--nsk-app-height',height);
      const editing=editingViewport();
      // Safari can leave the root document panned after dismissing its keyboard.
      // Only the inner content is scrollable; do not reset that content or a zoomed page.
      if(window.innerWidth<=760&&!editing&&(!window.visualViewport||Math.abs(window.visualViewport.scale-1)<0.01)&&window.scrollY!==0)window.scrollTo({top:0,left:0,behavior:'instant'});
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(sync);};
    for(const event of ['resize','orientationchange','pageshow','scroll'])window.addEventListener(event,schedule,{passive:true});
    window.visualViewport?.addEventListener('resize',schedule,{passive:true});
    window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
    document.addEventListener('focusout',()=>{schedule();setTimeout(schedule,150);setTimeout(schedule,500);});
    sync();
  }
  function mountCodes(){
    if(window.NSKShellHost||document.getElementById('arenaCodes')||!window.Auth?.getSession?.()?.user)return;
    const brand=document.querySelector('.arena-brand');if(!brand)return;
    const button=document.createElement('button');button.id='arenaCodes';button.type='button';button.className='arena-codes-button';button.textContent='Koder';button.setAttribute('aria-haspopup','dialog');
    const dialog=document.createElement('dialog');dialog.className='arena-codes-dialog';dialog.setAttribute('aria-labelledby','arenaCodesTitle');
    const title=document.createElement('h2');title.id='arenaCodesTitle';title.textContent='Koder';
    const label=document.createElement('p');label.textContent='Förråd';
    const code=document.createElement('p');code.className='arena-codes-value';code.textContent='6584';
    const teamLabel=document.createElement('p');teamLabel.textContent='Förråd NSK Team 18';
    const teamCode=document.createElement('p');teamCode.className='arena-codes-value';teamCode.textContent='1881';
    const close=document.createElement('button');close.type='button';close.textContent='Stäng';close.addEventListener('click',()=>dialog.close());
    dialog.append(title,label,code,teamLabel,teamCode,close);button.addEventListener('click',()=>dialog.showModal());
    dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}});
    brand.append(button);document.body.append(dialog);
  }
  async function render() {
    const nav = document.querySelector('nav.mainmenu');
    if (!nav) return;
    const viewport=document.querySelector('meta[name="viewport"]');
    if(viewport&&!/viewport-fit\s*=/.test(viewport.content))viewport.content+=',viewport-fit=cover';
    const parts=location.pathname.split('/').filter(Boolean);
    if(parts.at(-1)==='index.html')parts.pop();
    const active=parts.at(-1)||'startsida';
    document.body.classList.add('nsk-arena');
    decorateIcons();
    if(!iconObserver){iconObserver=new MutationObserver(decorateIcons);iconObserver.observe(document.body,{childList:true,subtree:true});}
    if(!document.querySelector('.arena-brand')){
      const brand=document.createElement('header');brand.className='arena-brand';
      brand.innerHTML='<img src="../icon-192.png" alt="NSK:s klubbmärke" width="64" height="64"><div><strong>NSK <span class="arena-team">TEAM 18</span></strong><span class="arena-club">Nyköpings sportklubb</span></div>';
      document.body.prepend(brand);
    }
    nav.innerHTML = '';
    const visibleEntries=[...entries];
    try { if(window.Auth){await window.Auth.init();if(window.Auth.getSession()?.permissions?.includes('users:manage'))visibleEntries.push(['anvandare','Användare']);} }catch{}
    mountCodes();
    for (const [slug,label] of visibleEntries) {
      const a = document.createElement('a');
      a.href = '../' + slug + '/' + (slug==='skapapoolspel'?'?new=1':'');
      a.textContent = label;
      if (slug === active) { a.classList.add('active'); a.setAttribute('aria-current','page'); }
      nav.append(a);
    }
    document.querySelector('.arena-bottom')?.remove();
    const bottom=document.createElement('nav');bottom.className='arena-bottom';
    // Keep the mobile bar outside the scrolling content; avoid iOS fixed-footer drift.
    let scroll=document.querySelector('body > .arena-scroll');
    if(!scroll){
      scroll=document.createElement('div');scroll.className='arena-scroll';
      for(const child of [...document.body.children]){
        if(!['SCRIPT','STYLE','LINK','DIALOG'].includes(child.tagName)&&!child.classList.contains('arena-bottom'))scroll.append(child);
      }
      document.body.prepend(scroll);
    }
    document.body.append(bottom);currentPage=active;menuState=cachedMenu();paintMenu();mountMenuEditor();void syncMenu();bindMobileViewport();decorateIcons();

  }
  function select(active){currentPage=active;paintMenu();document.querySelectorAll('nav.mainmenu a,.arena-bottom a').forEach(link=>{const selected=link.getAttribute('href')==='../'+active+'/';link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});document.querySelector('.arena-more>summary')?.classList.toggle('active',!!document.querySelector('.arena-more-menu a.active'));}
  window.NSKNavigation={select,refresh:render};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
