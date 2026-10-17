// Migration candidate for nsk-api, NOT deployed.
// Keep all legacy routes intact. Personal routes require isolated AUTH_DB D1.
import legacyWorker, { ShiftLock } from '../reference/legacy-nsk-api-worker-v42.snapshot.js';
import { handlePersonalRosterRead } from './production-personal-roster-endpoint.js';
import { handleProductionAuth } from './production-auth-boundary.js';

const PERSONAL_PREFIX = '/api/personal/';
export { ShiftLock };
export default {
  async fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/auth/')) {
      return handleProductionAuth(request, env);
    }
    if (pathname.startsWith(PERSONAL_PREFIX)) {
      return handlePersonalRosterRead(request, env);
    }
    return legacyWorker.fetch(request, env, context);
  }
};
