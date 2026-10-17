import { handleTeamAuth } from './team-auth.js';
import { handleActivation } from './account-activation.js';

const allowed = new Map([['/api/auth/login','POST'],['/api/auth/logout','POST'],['/api/auth/me','GET'],['/api/auth/feature-access','GET'],['/api/auth/integration/access','GET'],['/api/auth/activate','POST']]);
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!allowed.has(path)) return new Response('Not found', {status:404});
    if (request.method !== allowed.get(path)) return new Response('Method not allowed', {status:405});
    return path === '/api/auth/activate' ? handleActivation(request, env) : handleTeamAuth(request, env);
  }
};
