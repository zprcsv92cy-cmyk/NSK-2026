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
  let teamId;
  try {
    teamId = await resolveTeamId(request);
  } catch {
    return { ok: false, status: 502, error: 'Laget kunde inte verifieras' };
  }
  return authorizeRosterMutation(request, teamId, verifyIdentity, mutate);
}
