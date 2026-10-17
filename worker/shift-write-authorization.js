import { authorizeTeamFeature } from './team-authorization-policy.js';

/** Check a shift write against an already server-verified identity and pool owner. */
export async function authorizeShiftWrite(actor, poolId, { findPoolOwner, mutate } = {}) {
  if (!actor) return { ok: false, status: 401, error: 'Personlig inloggning krävs' };
  if (!Number.isSafeInteger(poolId) || poolId <= 0 || typeof findPoolOwner !== 'function' || typeof mutate !== 'function')
    return { ok: false, status: 400, error: 'Ogiltig skrivbegäran' };
  let teamId;
  try { teamId = await findPoolOwner(poolId); }
  catch { return { ok: false, status: 503, error: 'Laget kunde inte verifieras' }; }
  if (typeof teamId !== 'string' || !teamId || teamId.length > 100)
    return { ok: false, status: 403, error: 'Poolspel saknar verifierat lag' };
  const access = authorizeTeamFeature(actor, teamId, 'shifts');
  if (!access.allowed) return { ok: false, status: access.status, error: access.reason };
  return mutate();
}
