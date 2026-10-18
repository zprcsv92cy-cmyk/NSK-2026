/**
 * Translate existing staging membership names to legacy numeric Baserow IDs.
 * Production integration only. Never infer team membership from browser input.
 * A server-supplied list of Baserow teams must contain exactly one matching row.
 */
export function mapTrustedMembershipsToLegacyTeams(actor, teams, {
  season = '2026'
} = {}) {
  if (!actor?.user?.id || !Array.isArray(actor.memberships) ||
      !Array.isArray(actor.permissions) || !Array.isArray(teams)) {
    throw new Error('Trusted identity and team records required');
  }
  const resolved = [];
  const memberships = actor.is_global_admin === true
    ? [{team_id:'*',role:'owner'}]
    : actor.memberships;
  for (const member of memberships) {
    if (!member || typeof member.team_id !== 'string' || !member.team_id.trim())
      throw new Error('Invalid membership');
    const name = member.team_id.trim();
    if (name === '*') {
      if (member.role !== 'owner') throw new Error('Invalid global membership');
      for (const row of teams) {
        if (String(row?.['Säsong']) !== season) continue;
        const id = String(row.id);
        if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) ||
            typeof row.Namn !== 'string' || !row.Namn.trim() ||
            teams.filter(t=>t?.Namn===row.Namn&&String(t['Säsong'])===season).length!==1 ||
            resolved.some(x=>x.team_id===id)) throw Error('Ambiguous global team mapping');
        resolved.push({team_id:id,role:'owner'});
      }
      if (!resolved.length) throw Error('No verified teams');
      continue;
    }
    // Do not accept a numeric team string until it is explicitly mapped by a
    // trusted team name/season record. No client-provided substitutions.
    const matches = teams.filter(row =>
      row?.Namn === name &&
      String(row['Säsong']) === season &&
      /^[1-9]\d*$/.test(String(row.id)) &&
      Number.isSafeInteger(Number(row.id)));
    if (matches.length !== 1) throw new Error('Team mapping missing or ambiguous');
    const numericId = String(matches[0].id);
    if (resolved.some(x => x.team_id === numericId))
      throw new Error('Duplicate mapped team');
    resolved.push({ team_id: numericId, role: member.role });
  }
  return {
    user: { id: String(actor.user.id) },
    memberships: resolved,
    permissions: actor.is_global_admin === true
      ? [...new Set([...actor.permissions, 'read'])]
      : actor.permissions.slice()
  };
}
