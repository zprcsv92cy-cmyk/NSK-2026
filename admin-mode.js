// Compatibility cleanup for cached pages. NSK uses personal sign-in and team permissions.
(() => {
  document.getElementById('nsk-admin-bar')?.remove();
  document.getElementById('nsk-admin-dialog')?.remove();
  try { localStorage.removeItem('nsk_admin_token'); } catch {}
})();
