// A single shared navigation for every app view.
(() => {
  const entries = [
    ['startsida','Startsida'],['truppen','Truppen'],['traningsgrupper','Träning'],
    ['ovningsarkiv','Övningsarkiv'],['ritverktyg','Ritverktyg'],
    ['skapapoolspel','Skapa poolspel'],['malvaktsstatistik','Målvaktsstatistik'],
    ['bytesschema','Bytesschema'],['matchvy','Matchvy'],['lag','Lag'],
    ['mittkonto','Mitt konto']
  ];
  async function render() {
    const nav = document.querySelector('nav.mainmenu');
    if (!nav) return;
    const active = location.pathname.split('/').filter(Boolean).pop() || 'startsida';
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
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
