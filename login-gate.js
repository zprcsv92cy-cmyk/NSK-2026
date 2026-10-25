// Hide protected pages until the auth service validates a personal session.
// Only server-side authorization protects API data; this is the UI entry gate.
(() => {
  const root = document.documentElement;
  root.style.visibility = 'hidden';
  const loginUrl = new URL('../login/', location.href);
  const original = location.pathname + location.search;
  loginUrl.searchParams.set('next', original);
  function redirect() { location.replace(loginUrl.href); }
  const token = sessionStorage.getItem('nsk_user_token');
  const authBase = String(window.APP_CONFIG?.AUTH_URL || '').replace(/\/$/, '');
  if (!token || !authBase || !/^https:\/\//.test(authBase)) { redirect(); return; }
  fetch(authBase + '/api/auth/me', {
    headers: { Authorization: 'Bearer ' + token },
    credentials: 'omit', cache: 'no-store',
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
  }).then(async response => {
    if (!response.ok) { redirect(); return; }
    const identity = await response.json();
    if (!identity?.user || !Array.isArray(identity.memberships) || !Array.isArray(identity.permissions)) {
      redirect(); return;
    }
    root.style.visibility = '';
  }).catch(redirect);
})();
