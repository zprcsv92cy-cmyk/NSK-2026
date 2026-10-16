import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { guardRosterRoute } from './production-roster-route-guard.js';
import { guardLagpersonalMutation, resolveLagpersonalTeam } from './production-lagpersonal-auth-guard.js';
import { resolveLegacyRosterTeam } from './production-roster-team-resolver.js';

/**
 * Standalone integration boundary for a future Worker staging deployment.
 * Callers must supply server-owned Baserow readRow/listTeams and KV mutate
 * implementations. This module never falls back to the legacy admin token.
 * It does not register routes in the production Worker.
 */
export async function authorizePersonalWorkerWrite(request, env, {
  listTeams, readRow, mutateRoster, mutateLagpersonal
} = {}) {
  if (!request?.url) return { ok: false, status: 400, error: 'Ogiltig begäran' };
  const path = new URL(request.url).pathname;
  const verifyIdentity = createPersonalRosterIdentityVerifier(env);
  if (/^\/api\/(spelare|tranare)(?:\/\d+)?$/.test(path)) {
    return guardRosterRoute(request, {
      verifyIdentity,
      resolveTeamId: r => resolveLegacyRosterTeam(r, { listTeams, readRow }),
      mutate: () => {
        if (typeof mutateRoster !== 'function') return { ok: false, status: 500, error: 'Skrivfunktion saknas' };
        return mutateRoster(request);
      }
    });
  }
  if (path === '/api/lagpersonal') {
    return guardLagpersonalMutation(request, {
      verifyIdentity,
      resolveTeamId: r => resolveLagpersonalTeam(r, { listTeams }),
      mutate: () => {
        if (typeof mutateLagpersonal !== 'function') return { ok: false, status: 500, error: 'Skrivfunktion saknas' };
        return mutateLagpersonal(request);
      }
    });
  }
  return { ok: false, status: 404, error: 'Okänd skrivväg' };
}
