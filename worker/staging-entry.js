import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
