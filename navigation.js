// A single shared navigation for every app view.
(() => {
  const entries = [
    ['startsida','Kalender'],['truppen','Truppen'],['traningsgrupper','Träningsplanering'],
    ['ovningsarkiv','Övningsarkiv'],['ritverktyg','Ritverktyg'],
    ['skapapoolspel','Skapa poolspel'],['malvaktsstatistik','Målvaktsstatistik'],
    ['materialforvaltare','Materialförvaltare'],['mittkonto','Mitt konto']
  ];

  const iconPaths={"shirt":"<path d=\"m8 3-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3-2 2h-2z\"/>","mask":"<path d=\"M12 2c-5 0-8 4-8 9 0 6 4 11 8 11s8-5 8-11c0-5-3-9-8-9Z\"/><path d=\"M5 9h14M5 13h14M8 5v12m8-12v12M8 17h8m-4-8v12M9 4l3 3 3-3\"/>","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 2v6m10-6v6M3 11h18\"/>","image":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8\" cy=\"8\" r=\"1.5\"/><path d=\"m3 17 6-6 4 4 3-3 5 5\"/>","person":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2Z\"/>","group":"<circle cx=\"9\" cy=\"7\" r=\"3\"/><path d=\"M2 21v-3a7 7 0 0 1 14 0v3M17 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2\"/>","case":"<rect x=\"3\" y=\"7\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M8 7V3h8v4M3 12h18m-12 0v4h6v-4\"/>","plan":"<rect x=\"5\" y=\"4\" width=\"14\" height=\"18\" rx=\"2\"/><rect x=\"9\" y=\"2\" width=\"6\" height=\"4\" rx=\"1\"/><path d=\"M9 11h6m-6 4h6m-6 4h4\"/>"};
  function svgIcon(name){return '<svg class="arena-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+iconPaths[name]+'</svg>';}
  let iconObserver;
  function decorateIcons(){
    const attach=(element,name,replace=false)=>{if(!element||element.dataset.arenaIcon)return;element.dataset.arenaIcon=name;if(replace)element.innerHTML=svgIcon(name);else element.insertAdjacentHTML('afterbegin',svgIcon(name));};
    for(const [id,name] of Object.entries({trainingGoalieCount:'mask',trainingShirtColorCount:'shirt',trainingCalendar:'calendar',trainingHall:'case'}))attach(document.getElementById(id)?.closest('label'),name);
    for(const [id,name] of Object.entries({trainingGroupButton:'shirt',trainingPrintButton:'plan',trainingImportRead:'image'}))attach(document.getElementById(id),name);
    attach(document.querySelector('.training-import>summary'),'image');
    for(const heading of document.querySelectorAll('.training-page h2')){
      const name={'Spelare':'person','Tränare':'group','Materialförvaltare':'case','Målvakter':'mask','Tröjfärger':'shirt'}[heading.textContent.trim()];
      if(name)attach(heading,name);
    }
    for(const button of document.querySelectorAll('.nsk-training-function')){
      attach(button.querySelector('span'),button.hasAttribute('data-training-colors')?'shirt':'plan',true);
    }
    for(const [slug,name] of Object.entries({startsida:'calendar',truppen:'group',traningsgrupper:'plan'}))attach(document.querySelector('.arena-bottom>a[href="../'+slug+'/"]>span'),name,true);
  }
  let viewportBound=false;
  function bindMobileViewport(){
    if(viewportBound)return;viewportBound=true;
    let frame=0;
    const sync=()=>{
      frame=0;
      document.documentElement.style.setProperty('--nsk-app-height',Math.round(window.innerHeight)+'px');
      const editing=document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
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
      brand.innerHTML='<img src="../icon-192.png" alt="NSK:s klubbmärke" width="64" height="64"><div><strong>NSK TEAM 18</strong><span>Nyköpings sportklubb</span></div>';
      document.body.prepend(brand);
    }
    nav.innerHTML = '';
    const visibleEntries=[...entries];
    try { if(window.Auth){await window.Auth.init();if(window.Auth.getSession()?.permissions?.includes('users:manage'))visibleEntries.push(['anvandare','Användare']);} }catch{}
    for (const [slug,label] of visibleEntries) {
      const a = document.createElement('a');
      a.href = '../' + slug + '/';
      a.textContent = label;
      if (slug === active) { a.classList.add('active'); a.setAttribute('aria-current','page'); }
      nav.append(a);
    }
    document.querySelector('.arena-bottom')?.remove();
    const bottom=document.createElement('nav');bottom.className='arena-bottom';bottom.setAttribute('aria-label','Huvudnavigation');
    const icons={startsida:'▦',truppen:'♙',traningsgrupper:'☷'};
    for(const [slug,label] of [['startsida','Kalender'],['truppen','Truppen'],['traningsgrupper','Planering']]){
      const link=document.createElement('a');link.href='../'+slug+'/';link.innerHTML='<span aria-hidden="true">'+icons[slug]+'</span>'+label;
      if(slug===active){link.className='active';link.setAttribute('aria-current','page');}bottom.append(link);
    }
    const more=document.createElement('details');more.className='arena-more';
    const summary=document.createElement('summary');summary.innerHTML='<span aria-hidden="true">•••</span>Mer';more.append(summary);
    const menu=document.createElement('div');menu.className='arena-more-menu';
    for(const [slug,label] of visibleEntries.filter(([slug])=>!Object.hasOwn(icons,slug)&&slug!=='skapapoolspel')){const link=document.createElement('a');link.href='../'+slug+'/';link.textContent=label;if(slug===active){link.className='active';summary.classList.add('active');}menu.append(link);}
    more.append(menu);bottom.append(more);
    // Keep the mobile bar outside the scrolling content; avoid iOS fixed-footer drift.
    let scroll=document.querySelector('body > .arena-scroll');
    if(!scroll){
      scroll=document.createElement('div');scroll.className='arena-scroll';
      for(const child of [...document.body.children]){
        if(!['SCRIPT','STYLE','LINK','DIALOG'].includes(child.tagName)&&!child.classList.contains('arena-bottom'))scroll.append(child);
      }
      document.body.prepend(scroll);
    }
    document.body.append(bottom);bindMobileViewport();decorateIcons();

  }
  function select(active){document.querySelectorAll('nav.mainmenu a,.arena-bottom a').forEach(link=>{const selected=link.getAttribute('href')==='../'+active+'/';link.classList.toggle('active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});document.querySelector('.arena-more>summary')?.classList.toggle('active',!!document.querySelector('.arena-more-menu a.active'));}
  window.NSKNavigation={select,refresh:render};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
