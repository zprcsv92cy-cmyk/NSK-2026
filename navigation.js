// A single shared navigation for every app view.
(() => {
  const entries = [
    ['startsida','Kalender'],['truppen','Truppen'],['traningsgrupper','Träningsplanering'],
    ['ovningsarkiv','Övningsarkiv'],['ritverktyg','Ritverktyg'],
    ['skapapoolspel','Skapa poolspel'],['malvaktsstatistik','Målvaktsstatistik'],
    ['bytesschema','Bytesschema'],['matchvy','Matchvy'],['lag','Lag'],
    ['mittkonto','Mitt konto']
  ];
  async function render() {
    const nav = document.querySelector('nav.mainmenu');
    if (!nav) return;
    const parts=location.pathname.split('/').filter(Boolean);
    if(parts.at(-1)==='index.html')parts.pop();
    const active=parts.at(-1)||'startsida';
    document.body.classList.add('nsk-arena');
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
    for(const [slug,label] of visibleEntries.filter(([slug])=>!Object.hasOwn(icons,slug))){const link=document.createElement('a');link.href='../'+slug+'/';link.textContent=label;if(slug===active){link.className='active';summary.classList.add('active');}menu.append(link);}
    more.append(menu);bottom.append(more);document.body.append(bottom);

  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
