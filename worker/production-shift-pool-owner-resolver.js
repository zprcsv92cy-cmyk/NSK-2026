/**
 * Resolves the owner of a pool from Baserow records, never from request data.
 * Team IDs are canonical decimal Baserow row IDs represented as strings, which
 * must match the membership team_id convention in AUTH_DB.
 */
export function createPoolOwnerResolver(env, fetchImpl = fetch) {
  return async function findPoolOwner({ poolId, shiftRowId, lagNo, resolveOnly = true } = {}) {
    if (!env?.BASEROW_TOKEN || ((!Number.isSafeInteger(poolId) || poolId <= 0) && (!Number.isSafeInteger(shiftRowId) || shiftRowId <= 0)) || !Number.isSafeInteger(lagNo) || lagNo <= 0)
      throw new Error('Pool owner resolver is not configured');
    const headers = { Authorization: 'Token ' + env.BASEROW_TOKEN };
    const base = 'https://api.baserow.io/api/database/rows/table/';
    let resolvedPoolId = poolId;
    if (Number.isSafeInteger(shiftRowId) && shiftRowId > 0) {
      const shiftResponse = await fetchImpl(`${base}1255115/${shiftRowId}/?user_field_names=true`, { headers });
      if (!shiftResponse.ok) throw new Error('Byte kunde inte läsas');
      const shift = await shiftResponse.json();
      resolvedPoolId = Number((shift.Poolspel || [])[0]?.id || (shift.Poolspel || [])[0]);
    }
    if (!Number.isSafeInteger(resolvedPoolId) || resolvedPoolId <= 0) throw new Error('Ogiltigt poolspel');
    const poolResponse = await fetchImpl(`${base}1255101/${resolvedPoolId}/?user_field_names=true`, { headers });
    if (!poolResponse.ok) throw new Error('Poolspel kunde inte läsas');
    const pool = await poolResponse.json();
    const links = Array.isArray(pool.Lag) ? pool.Lag : [];
    const ids = links.map(x => Number(typeof x === 'object' ? x?.id : x));
    const teamId = ids[lagNo - 1];
    if (!Number.isSafeInteger(teamId) || teamId <= 0 || ids.some(id => !Number.isSafeInteger(id) || id <= 0))
      throw new Error('Poolspel saknar angivet lag');
    const teamResponse = await fetchImpl(`${base}1255083/${teamId}/?user_field_names=true`, { headers });
    if (!teamResponse.ok) throw new Error('Lag kunde inte verifieras');
    const team = await teamResponse.json();
    if (Number(team.id) !== teamId || typeof team.Namn !== 'string' || !team.Namn.trim())
      throw new Error('Lagets identitet kunde inte verifieras');
    return { teamId: String(team.id), teamName: team.Namn, poolId: resolvedPoolId };
  };
}
