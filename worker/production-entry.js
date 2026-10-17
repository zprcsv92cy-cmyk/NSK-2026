import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';

const allowed = new Map([['/api/auth/login','POST'],['/api/auth/logout','POST'],['/api/auth/me','GET'],['/api/auth/feature-access','GET'],['/api/auth/integration/access','GET'],['/api/auth/activate','POST']]);
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!allowed.has(path)) return new Response('Not found', {status:404});
    const origin = request.headers.get('Origin');
    const site = 'https://zprcsv92cy-cmyk.github.io';
    if (origin && origin !== site) return new Response('Forbidden', {status:403});
    const headers = new Headers({'Cache-Control':'no-store', 'Vary':'Origin'});
    if (origin === site) headers.set('Access-Control-Allow-Origin', site);
    if (request.method === 'OPTIONS') {
      if (origin !== site) return new Response(null, {status:403});
      headers.set('Access-Control-Allow-Methods', allowed.get(path) + ', OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      return new Response(null, {status:204, headers});
    }
    if (request.method !== allowed.get(path)) return new Response('Method not allowed', {status:405, headers});
    let result;
    try { result = await (path === '/api/auth/activate' ? handleActivation(request, env) : handleTeamAuth(request, env)); }
    catch { return new Response('Service unavailable', {status:503, headers}); }
    const output = new Headers(result.headers);
    output.delete('Access-Control-Allow-Origin');
    for (const [key, value] of headers) output.set(key, value);
    output.set('X-Content-Type-Options', 'nosniff');
    return new Response(result.body, {status:result.status, headers:output});
  }
};
