// Server-owned team-scoped roster data boundary.
// Not installed in deployed nsk-api Worker. Callbacks must access trusted sources.
function belongsToTeam(row, teamId) {
  return Array.isArray(row?.Lag) && row.Lag.some(link =>
    String(link && typeof link === 'object' ? link.id : link) === teamId);
}

export async function readScopedLegacyRoster(request, teamId, {
  fetchAllRosterRows, fetchTeamStaff
} = {}) {
  const url = new URL(request.url);
  const match = /^\/api\/(spelare|tranare|lagpersonal)(?:\/(\d+))?$/.exec(url.pathname);
  if (request.method !== 'GET' || !match) throw new Error('Unsupported roster route');
  if (typeof teamId !== 'string' || !/^[1-9]\d*$/.test(teamId) ||
      !Number.isSafeInteger(Number(teamId))) throw new Error('Invalid trusted team');
  const [,table,rowId] = match;
  let rows;
  if (table === 'lagpersonal') {
    if (typeof fetchTeamStaff !== 'function') throw new Error('Trusted staff store missing');
    // KV key is derived from validated teamId by this server-owned callback.
    rows = await fetchTeamStaff(teamId);
  } else {
    if (typeof fetchAllRosterRows !== 'function') throw new Error('Trusted roster store missing');
    const all = await fetchAllRosterRows(table);
    if (!Array.isArray(all)) throw new Error('Incomplete roster source');
    rows = all.filter(row => belongsToTeam(row, teamId));
  }
  if (!Array.isArray(rows)) throw new Error('Incomplete team records');
  if (rowId) rows = rows.filter(row => String(row?.id) === rowId);
  const params = url.searchParams;
  const pageValues = params.getAll('page'), sizeValues = params.getAll('size');
  if (pageValues.length > 1 || sizeValues.length > 1) throw new Error('Ambiguous pagination');
  const page = Number(pageValues[0] || 1), size = Number(sizeValues[0] || 200);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000 ||
      !Number.isSafeInteger(size) || size < 1 || size > 200) throw new Error('Invalid pagination');
  const start = (page - 1) * size;
  // Preserve legacy shape while refusing to expose unfiltered Baserow pages.
  return Response.json({
    ok: true,
    results: rows.slice(start, start + size),
    next: start + size < rows.length ? page + 1 : null
  }, { headers: { 'cache-control':'no-store', 'x-content-type-options':'nosniff' } });
}
