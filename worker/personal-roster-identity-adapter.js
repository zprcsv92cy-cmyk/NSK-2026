import { verifyStagingSession } from './staging-session-identity.js';

/**
 * Isolated adapter for a future personal-auth Worker integration.
 * This never falls back to the legacy shared admin token.
 * AUTH_DB must be a dedicated D1 binding with migrated auth tables.
 */
export function createPersonalRosterIdentityVerifier(env) {
  return async function verifyIdentity(token) {
    if (!env?.AUTH_DB) return null;
    try {
      const actor = await verifyStagingSession(token, env);
      if (!actor || !Array.isArray(actor.memberships) || !Array.isArray(actor.permissions))
        return null;
      return {
        user: actor.user,
        ...(actor.is_primary_admin===true?{is_primary_admin:true}:{}),
        is_global_admin: actor.is_global_admin === true,
        memberships: actor.memberships.map(m => ({
          team_id: typeof m?.team_id === 'string' ? m.team_id : String(m?.team_id ?? ''),
          role: m?.role
        })),
        permissions: actor.permissions
      };
    } catch {
      return null;
    }
  };
}
