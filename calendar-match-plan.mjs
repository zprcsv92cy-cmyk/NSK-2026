/**
 * Pure calendar import mapping. Does not write to Baserow or require a lineup.
 * Match metadata is persisted separately by the API integration.
 */
export function planCalendarMatches(matches) {
  if (!Array.isArray(matches)) throw new TypeError('Matcher måste vara en lista');
  const valid = matches.filter(m =>
    m && typeof m.startTime === 'string' &&
    /^([01]\\d|2[0-3]):[0-5]\\d$/.test(m.startTime) &&
    typeof m.opponent === 'string' && m.opponent.trim()
  ).slice(0, 16).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const teams = valid.length > 4 ? 2 : 1;
  const perTeam = Math.ceil(valid.length / teams);
  return {
    teams,
    matchesPerTeam: perTeam,
    schedule: valid.map((m, i) => ({
      lag_no: Math.floor(i / perTeam) + 1,
      match_no: i % perTeam + 1,
      start_time: m.startTime,
      opponent: m.opponent.trim(),
      plan: typeof m.plan === 'string' ? m.plan.slice(0, 80) : ''
    }))
  };
}
