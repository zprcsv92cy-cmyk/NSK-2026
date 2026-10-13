import { handleTeamAuth } from './team-auth.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/auth/')) {
      return new Response(JSON.stringify({ error: 'Okänd adress' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
      });
    }
    return handleTeamAuth(request, env);
  }
};
