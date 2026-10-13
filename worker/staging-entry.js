import { activationPage } from './activation-page.js';
import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/aktivera/' || url.pathname === '/aktivera') {
      return new Response(activationPage, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (!url.pathname.startsWith('/api/auth/')) {
      return new Response(JSON.stringify({ error: 'Okänd adress' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    if (url.pathname === '/api/auth/activate') return handleActivation(request, env);
    return handleTeamAuth(request, env);
  }
};
