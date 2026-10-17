/**
 * Resolves the owner of a pool from Baserow records, never from request data.
 * Team IDs are canonical decimal Baserow row IDs represented as strings, which
 * must match the membership team_id convention in AUTH_DB.
 */
export function createPoolOwnerResolver(env, fetchImpl = fetch) {
  return async function findPoolOwner({ poolId, shiftRowId, resolveOnly = true } = {}) {
    if (!env?.BASEROW_TOKEN || !Number.isSafeInteger(poolId) || poolId <= 0)
      throw new Error('Pool owner resolver is not configured');
    const headers = { Authorization: 'Token ' + env.BASEROW_TOKEN };
    const base = 'https://api.baserow.io/api/database/rows/table/';
    const poolResponse = await fetchImpl(`${base}1255101/${poolId}/?user_field_names=true`, { headers });
    if (!poolResponse.ok) throw new Error('Poolspel kunde inte läsas');
    const pool = await poolResponse.json();
    const links = Array.isArray(pool.Lag) ? pool.Lag : [];
    const ids = links.map(x => Number(typeof x === 'object' ? x?.id : x));
    if (ids.length !== 1 || !Number.isSafeInteger(ids[0]) || ids[0] <= 0)
      throw new Error('Poolspel saknar entydigt lag');
    const teamResponse = await fetchImpl(`${base}1255083/${ids[0]}/?user_field_names=true`, { headers });
    if (!teamResponse.ok) throw new Error('Lag kunde inte verifieras');
    const team = await teamResponse.json();
    if (Number(team.id) !== ids[0] || typeof team.Namn !== 'string' || !team.Namn.trim())
      throw new Error('Lagets identitet kunde inte verifieras');
    return { teamId: String(team.id), teamName: team.Namn, poolId };
  };
}
