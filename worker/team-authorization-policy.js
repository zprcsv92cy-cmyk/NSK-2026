// Server-side authorization policy for the future protected NSK production API.
// This module does not modify or activate any production endpoint.
export const FEATURE_PERMISSIONS = Object.freeze({
  roster: 'roster:manage',
  pool: 'pool:create',
  lineup: 'lineup:edit',
  shifts: 'shifts:check',
  matches: 'match:manage',
  pool_finish: 'pool:finish',
  pool_reopen: 'pool:reopen',
  users: 'users:manage'
});

export function authorizeTeamFeature(actor, teamId, feature) {
  if (!actor) return { allowed: false, status: 401, reason: 'Inte inloggad' };
  if (typeof teamId !== 'string' || !teamId || teamId.length > 100 ||
      !Object.prototype.hasOwnProperty.call(FEATURE_PERMISSIONS, feature)) {
    return { allowed: false, status: 400, reason: 'Ogiltigt lag eller funktion' };
  }
  const membership = Array.isArray(actor.memberships)
    ? actor.memberships.find(m => m && m.team_id === teamId) : null;
  if (!membership) return { allowed: false, status: 403, reason: 'Ingen åtkomst till laget' };
  const permission = FEATURE_PERMISSIONS[feature];
  const allowed = membership.role === 'team_admin' &&
    Array.isArray(actor.permissions) && actor.permissions.includes(permission);
  return { allowed, status: allowed ? 200 : 403,
    reason: allowed ? 'Tillåtet' : 'Saknar behörighet', permission };
}

/**
 * Resolve authorization before executing a production write.
 * The caller must supply a server-verified identity, never browser-provided roles.
 * No write handler is invoked when access is denied.
 */
export async function requireTeamWrite(actor, teamId, feature, handler) {
  const decision = authorizeTeamFeature(actor, teamId, feature);
  if (!decision.allowed) {
    return { ok: false, status: decision.status, error: decision.reason };
  }
  if (typeof handler !== 'function') {
    return { ok: false, status: 500, error: 'Skrivfunktion saknas' };
  }
  return handler();
}

/**
 * Use for every protected roster mutation in the production API.
 * verifyIdentity must authenticate the bearer token server-side.
 * teamId must be resolved from the affected row or trusted server mapping,
 * not taken solely from client input for PATCH/DELETE.
 */
export async function authorizeRosterMutation(request, teamId, verifyIdentity, mutate) {
  if (!request || typeof verifyIdentity !== 'function' || typeof mutate !== 'function') {
    return { ok: false, status: 500, error: 'Säkerhetskontroll saknas' };
  }
  const header = request.headers?.get?.('Authorization') || '';
  const match = /^Bearer ([^\\s]+)$/.exec(header);
  if (!match) return { ok: false, status: 401, error: 'Personlig inloggning krävs' };
  let actor;
  try { actor = await verifyIdentity(match[1]); }
  catch { return { ok: false, status: 401, error: 'Inloggningen kunde inte verifieras' }; }
  return requireTeamWrite(actor, teamId, 'roster', mutate);
}
