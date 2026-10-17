import { createPersonalRosterIdentityVerifier } from './personal-roster-identity-adapter.js';
import { authorizeShiftWrite } from './shift-write-authorization.js';

/**
 * Fail-closed wrapper for the legacy shift-save and shift-done endpoints.
 * Integrators must provide a trusted pool-owner resolver and the actual
 * mutation callback. This module deliberately does not infer team ownership
 * from browser input or invoke the legacy shared-admin session as identity.
 */
export async function guardShiftRoute(request, env, { findPoolOwner, mutate, verifyIdentity } = {}) {
  if (!request || !env?.AUTH_DB || typeof findPoolOwner !== 'function' || typeof mutate !== 'function')
    return Response.json({ ok: false, error: 'Personlig behörighetskontroll saknas' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '');
  if (!match) return Response.json({ ok: false, error: 'Personlig inloggning krävs' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  let actor;
  try { actor = await (verifyIdentity || createPersonalRosterIdentityVerifier(env))(match[1]); }
  catch { actor = null; }
  if (!actor) return Response.json({ ok: false, error: 'Inloggningen kunde inte verifieras' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  let poolId;
  try {
    if (new URL(request.url).pathname === '/api/bytesschema/save') {
      const body = await request.clone().json();
      poolId = body?.pool_id;
      if (Object.hasOwn(body || {}, 'team_id') || Object.hasOwn(body || {}, 'teamId'))
        return Response.json({ ok: false, error: 'Lag får inte anges av klienten' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    } else {
      const m = /^\/api\/bytesschema\/(\d+)\/done$/.exec(new URL(request.url).pathname);
      if (!m) return Response.json({ ok: false, error: 'Ogiltig bytesschemaadress' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const row = await findPoolOwner({ shiftRowId: Number(m[1]), resolveOnly: true });
      poolId = row?.poolId;
    }
  } catch {
    return Response.json({ ok: false, error: 'Poolspel kunde inte verifieras' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  const result = await authorizeShiftWrite(actor, poolId, {
    findPoolOwner: async id => {
      const owner = await findPoolOwner({ poolId: id, resolveOnly: true });
      return owner?.teamId ?? null;
    },
    mutate: () => mutate(actor, poolId)
  });
  if (result?.ok === false) return Response.json(result, { status: result.status || 403, headers: { 'Cache-Control': 'no-store' } });
  return result instanceof Response ? result : Response.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
