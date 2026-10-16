import { authorizeRosterMutation } from './team-authorization-policy.js';

/**
 * Server-side adapter for roster write routes.
 *
 * resolveTeamId must derive the target team from trusted server state:
 * - POST: validated team mapping, not a browser-supplied role/team assertion.
 * - PATCH: read the persisted row and derive its team before authorization.
 *
 * verifyIdentity must validate the bearer token with the trusted auth service.
 * mutate must perform the write only after both checks pass.
 */
export async function guardRosterRoute(request, { resolveTeamId, verifyIdentity, mutate } = {}) {
  if (typeof resolveTeamId !== 'function' ||
      typeof verifyIdentity !== 'function' ||
      typeof mutate !== 'function') {
    return { ok: false, status: 500, error: 'Säkerhetskontroll saknas' };
  }
  // Only intended roster mutations may pass this write guard.
  if (!['POST', 'PATCH', 'DELETE'].includes(request?.method)) {
    return { ok: false, status: 405, error: 'Metoden är inte tillåten' };
  }
  // Reject missing credentials before performing any database/team lookup.
  const authorization = request?.headers?.get?.('Authorization') || '';
  if (!/^Bearer ([^\s]+)$/.test(authorization)) {
    return { ok: false, status: 401, error: 'Personlig inloggning krävs' };
  }
  let teamId;
  try {
    teamId = await resolveTeamId(request);
  } catch {
    return { ok: false, status: 502, error: 'Laget kunde inte verifieras' };
  }
  if (typeof teamId !== 'string' || !teamId.trim() || teamId.length > 100) {
    return { ok: false, status: 502, error: 'Laget kunde inte verifieras' };
  }
  return authorizeRosterMutation(request, teamId, verifyIdentity, mutate);
}
