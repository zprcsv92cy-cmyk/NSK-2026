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
  const values = url.searchParams.getAll('team_id');
  if (values.length !== 1) throw new Error('Ambiguous team');
  const raw = values[0];
  if (!raw || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Invalid team');
  const teams = await listTeams();
  if (!Array.isArray(teams)) throw new Error('Team list unavailable');
  const matches = teams.filter(t => t && /^[1-9]\d*$/.test(String(t.id)) && Number.isSafeInteger(Number(t.id)) && String(t.id) === raw);
  if (matches.length !== 1) throw new Error('Unknown or ambiguous team');
  const team = matches[0];
  if (request.method === 'PATCH') {
    if (typeof readStaff !== 'function') throw new Error('Stored staff ownership lookup missing');
    const staffIds = url.searchParams.getAll('id');
    if (staffIds.length !== 1) throw new Error('Ambiguous staff ID');
    const staffId = staffIds[0];
    if (!staffId || !/^[A-Za-z0-9_-]{1,100}$/.test(staffId)) throw new Error('Invalid staff ID');
    const stored = await readStaff(staffId);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) ||
        !/^[1-9]\d*$/.test(String(stored.team_id)) ||
        !Number.isSafeInteger(Number(stored.team_id)) ||
        String(stored.team_id) !== raw) throw new Error('Stored staff belongs to another team');
  }
  return String(team.id);
}
