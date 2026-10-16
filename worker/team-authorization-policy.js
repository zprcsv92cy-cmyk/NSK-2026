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
