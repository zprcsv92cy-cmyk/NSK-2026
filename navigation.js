// A single shared navigation for every app view. Hidden features stay hidden.
(() => {
  const entries = [
    ['startsida','Startsida'],['truppen','Truppen'],['traningsgrupper','Träning'],
    ['ovningsarkiv','Övningsarkiv'],['ritverktyg','Ritverktyg'],
    ['skapapoolspel','Skapa poolspel'],['malvaktsstatistik','Målvaktsstatistik'],
    ['bytesschema','Bytesschema'],['matchvy','Matchvy'],['lag','Lag'],
    ['mittkonto','Mitt konto']
  ];
  function render() {
    const nav = document.querySelector('nav.mainmenu');
    if (!nav) return;
    const active = location.pathname.split('/').filter(Boolean).pop() || 'startsida';
    const showTraining = window.APP_CONFIG?.ENABLE_SHARED_TRAINING === true;
    nav.innerHTML = '';
    for (const [slug,label] of entries) {
      if (slug === 'traningsgrupper' && !showTraining) continue;
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
