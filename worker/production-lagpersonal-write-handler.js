import { authorizePersonalWorkerWrite } from './personal-roster-worker-adapter.js';

/**
 * Protected lagpersonal write handler for integration with the production API.
 * Not registered by the deployed Worker. Requires AUTH_DB, NSK_TRAINERS and
 * a trusted Baserow team reader supplied by the host.
 */
export async function handlePersonalLagpersonalWrite(request, env, { listTeams } = {}) {
  if (!request || new URL(request.url).pathname !== '/api/lagpersonal' ||
      !['POST', 'PATCH'].includes(request.method))
    return { ok: false, status: 405, error: 'Metoden är inte tillåten' };
  if (!env?.AUTH_DB || !env?.NSK_TRAINERS || typeof listTeams !== 'function')
    return { ok: false, status: 503, error: 'Säker lagring eller laguppslag saknas' };
  return authorizePersonalWorkerWrite(request, env, {
    listTeams,
    readTeamStaff: async teamId => {
      const rows = await env.NSK_TRAINERS.get('lagpersonal:team:' + teamId, 'json');
      if (rows !== null && !Array.isArray(rows)) throw Error('Invalid KV data');
      return rows || [];
    },
    mutateLagpersonal: async authorizedRequest => {
      const url = new URL(authorizedRequest.url);
      const teamId = url.searchParams.get('team_id');
      if (!/^[1-9]\\d*$/.test(teamId || '') || url.searchParams.getAll('team_id').length !== 1)
        return { ok: false, status: 400, error: 'Ogiltigt lag' };
      let body;
      try { body = await authorizedRequest.clone().json(); }
      catch { return { ok: false, status: 400, error: 'Ogiltig JSON' }; }
      const allowed = ['Lagledare', 'Fysansvarig', 'Materialförvaltare'];
      if (!body || typeof body.name !== 'string' || !body.name.trim() ||
          body.name.trim().length > 150 || !allowed.includes(body.role))
        return { ok: false, status: 400, error: 'Ogiltigt namn eller uppdrag' };
      const key = 'lagpersonal:team:' + teamId;
      const stored = await env.NSK_TRAINERS.get(key, 'json');
      if (stored !== null && !Array.isArray(stored))
        return { ok: false, status: 503, error: 'Ogiltig lagring' };
      const rows = stored || [];
      if (authorizedRequest.method === 'POST') {
        if (rows.some(row => row.role === body.role &&
            row.name?.toLocaleLowerCase('sv') === body.name.trim().toLocaleLowerCase('sv')))
          return { ok: false, status: 409, error: 'Personen finns redan' };
        const row = { id: crypto.randomUUID(), name: body.name.trim(), role: body.role };
        rows.push(row);
        await env.NSK_TRAINERS.put(key, JSON.stringify(rows));
        return { ok: true, status: 201, row };
      }
      if (typeof body.id !== 'string') return { ok: false, status: 400, error: 'Saknar ID' };
      const row = rows.find(item => item.id === body.id && item.role === body.role);
      if (!row) return { ok: false, status: 404, error: 'Personen saknas' };
      row.name = body.name.trim();
      await env.NSK_TRAINERS.put(key, JSON.stringify(rows));
      return { ok: true, status: 200, row };
    }
  });
}
