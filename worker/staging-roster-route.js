import { stagingRoster } from './staging-roster.js';
import { verifyStagingSession } from './staging-session-identity.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

/**
 * Mount this handler under /api/auth/roster-staging and /api/auth/roster-staging/:id.
 * verifyIdentity must validate the personal session token on the server and
 * return the trusted actor (including memberships and permissions).
 * No fallback to the legacy shared admin token is permitted.
 */
export async function handleStagingRosterRoute(request, env, verifyIdentity = verifyStagingSession) {
  if (typeof verifyIdentity !== 'function' || !env?.AUTH_DB) {
    return json({ error: 'Stagingbehörighet är inte konfigurerad' }, 503);
  }
  const header = request?.headers?.get?.('Authorization') || '';
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  if (!match) return json({ error: 'Personlig inloggning krävs' }, 401);

  let actor;
  try {
    actor = await verifyIdentity(match[1], env);
  } catch {
    return json({ error: 'Inloggningen kunde inte verifieras' }, 401);
  }
  if (!actor) return json({ error: 'Personlig inloggning krävs' }, 401);
  try {
    return await stagingRoster(request, env.AUTH_DB, actor, json);
  } catch {
    return json({ error: 'Stagingtruppen kunde inte behandlas' }, 503);
  }
}
