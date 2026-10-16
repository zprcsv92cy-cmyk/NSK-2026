import { authorizeRosterMutation } from './team-authorization-policy.js';

/**
 * Preparation for personal, team-scoped authorization of lagpersonal writes.
 * Not imported by the deployed production Worker.
 * A trusted server-side team lookup must validate the requested team ID.
 */
export async function guardLagpersonalMutation(request, { resolveTeamId, verifyIdentity, mutate } = {}) {
  if (!request || !['POST', 'PATCH'].includes(request.method))
    return { ok: false, status: 405, error: 'Metoden är inte tillåten' };
  if (typeof resolveTeamId !== 'function' || typeof verifyIdentity !== 'function' || typeof mutate !== 'function')
    return { ok: false, status: 500, error: 'Säkerhetskontroll saknas' };
  if (!/^Bearer ([^\s]+)$/.test(request.headers?.get?.('Authorization') || ''))
    return { ok: false, status: 401, error: 'Personlig inloggning krävs' };
  let teamId;
  try { teamId = await resolveTeamId(request); }
  catch { return { ok: false, status: 502, error: 'Laget kunde inte verifieras' }; }
  if (typeof teamId !== 'string' || !teamId.trim() || teamId.length > 100)
    return { ok: false, status: 502, error: 'Laget kunde inte verifieras' };
  return authorizeRosterMutation(request, teamId, verifyIdentity, mutate);
}

/** Resolve requested team against server-owned team records, never client role claims. */
export async function resolveLagpersonalTeam(request, { listTeams, readStaff } = {}) {
  if (typeof listTeams !== 'function') throw new Error('Team lookup unavailable');
  const url = new URL(request.url);
  const raw = url.searchParams.get('team_id');
  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Invalid team');
  const teams = await listTeams();
  if (!Array.isArray(teams)) throw new Error('Team list unavailable');
  const team = teams.find(t => String(t?.id) === raw);
  if (!team) throw new Error('Unknown team');
  if (request.method === 'PATCH') {
    if (typeof readStaff !== 'function') throw new Error('Stored staff ownership lookup missing');
    const staffId = url.searchParams.get('id');
    if (!staffId || !/^[A-Za-z0-9_-]{1,100}$/.test(staffId)) throw new Error('Invalid staff ID');
    const stored = await readStaff(staffId);
    if (!stored || String(stored.team_id ?? '') !== raw) throw new Error('Stored staff belongs to another team');
  }
  return String(team.id);
}
