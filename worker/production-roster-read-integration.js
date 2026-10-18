// Integration boundary connecting verified staging identity to numeric Baserow teams.
// This file is NOT imported by the production Worker yet.
import { guardProductionRosterRead } from './production-roster-read-guard.js';
import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { mapTrustedMembershipsToLegacyTeams } from './production-team-id-map.js';
import { readScopedLegacyRoster } from './production-roster-scoped-data.js';

/**
 * All dependencies must be server-owned and must never trust browser-provided roles.
 * resolveOwnerTeam must derive ownership from a persisted row or trusted route scope.
 * readTeamData MUST query/filter by numeric ownerTeam on the server; client-side filtering
 * of a broad data response is not sufficient.
 */
export async function readPersonallyAuthorizedLegacyRoster(request, {
  verifyPersonalSession, listTrustedTeams, resolveOwnerTeam, readTeamData
} = {}) {
  return guardProductionRosterRead(request, {
    verifyIdentity: async req => {
      if (typeof verifyPersonalSession !== 'function' || typeof listTrustedTeams !== 'function')
        throw new Error('Personal session integration unavailable');
      const session = await verifyPersonalSession(req);
      if (!session) return null;
      const teams = await listTrustedTeams();
      return mapTrustedMembershipsToLegacyTeams(session, teams);
    },
    resolveOwnerTeam,
    readTeamData
  });
}

/**
 * Fully scoped response adapter: uses the existing personal session guard and
 * emits only team-owned roster records in the original API response shape.
 * Does NOT register any production API routes; server owners must wire it.
 */
export function readPersonallyAuthorizedScopedRoster(request, {
  fetchAllRosterRows, fetchTeamStaff, ...trusted
} = {}) {
  return readPersonallyAuthorizedLegacyRoster(request, {
    ...trusted,
    readTeamData: (req, teamId) => readScopedLegacyRoster(req, teamId, {
      fetchAllRosterRows, fetchTeamStaff
    })
  });
}

/**
 * Production identity adapter for the current Worker. Session validation uses
 * the existing dedicated AUTH_DB verifier; never the shared admin token.
 * Team lookup and row ownership remain explicit trusted dependencies.
 * This function does not mount a route or change the deployed Worker.
 */
export function createProductionRosterReadHandler(env, trusted = {}) {
  const verifyToken = createPersonalRosterIdentityVerifier(env);
  return request => readPersonallyAuthorizedLegacyRoster(request, {
    ...trusted,
    verifyPersonalSession: async req => {
      const match = /^Bearer ([^\s]+)$/.exec(req.headers.get('Authorization') || '');
      return match ? verifyToken(match[1]) : null;
    }
  });
}
