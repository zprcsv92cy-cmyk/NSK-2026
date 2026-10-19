/**
 * Resolves the owner of a pool from Baserow records, never from request data.
 * Authorization team IDs must match the canonical team_id values in AUTH_DB.
 * Baserow row IDs are used only to fetch the trusted team record.
 */
export function createPoolOwnerResolver(env, fetchImpl = fetch) {
  return async function findPoolOwner({ poolId, shiftRowId, lagNo, resolveOnly = true } = {}) {
    if (!env?.BASEROW_TOKEN || ((!Number.isSafeInteger(poolId) || poolId <= 0) && (!Number.isSafeInteger(shiftRowId) || shiftRowId <= 0)) || (lagNo !== undefined && (!Number.isSafeInteger(lagNo) || lagNo <= 0)))
      throw new Error('Pool owner resolver is not configured');
    const headers = { Authorization: 'Token ' + env.BASEROW_TOKEN };
    const base = 'https://api.baserow.io/api/database/rows/table/';
    const configuredTables = env?.BASEROW_TABLE_IDS ? JSON.parse(env.BASEROW_TABLE_IDS) : null;
    if (configuredTables) {
      // Validate the complete required mapping before making any network request.
      for (const name of ['lag', 'poolspel', 'bytesschema']) {
        const id = configuredTables[name];
        if (!Number.isSafeInteger(id) || id <= 0 ||
            [1255083,1255098,1255100,1255101,1255109,1255113,1255115,1255119,1255152,1255157].includes(id))
          throw new Error('Invalid Baserow table mapping');
      }
    }
    const tableId = (name, legacy) => {
      if (!configuredTables) return legacy;
      const id = configuredTables[name];
      if (!Number.isSafeInteger(id) || id <= 0 || [1255083, 1255098, 1255100, 1255101, 1255109, 1255113, 1255115, 1255119, 1255152, 1255157].includes(id)) throw new Error('Invalid Baserow table mapping');
      return id;
    };
    let resolvedPoolId = poolId;
    if (Number.isSafeInteger(shiftRowId) && shiftRowId > 0) {
      const shiftResponse = await fetchImpl(`${base}${tableId('bytesschema', 1255115)}/${shiftRowId}/?user_field_names=true`, { headers });
      if (!shiftResponse.ok) throw new Error('Byte kunde inte läsas');
      const shift = await shiftResponse.json();
      resolvedPoolId = Number((shift.Poolspel || [])[0]?.id || (shift.Poolspel || [])[0]);
      lagNo = Number(shift.Lagnummer);
    }
    if (!Number.isSafeInteger(resolvedPoolId) || resolvedPoolId <= 0) throw new Error('Ogiltigt poolspel');
    const poolResponse = await fetchImpl(`${base}${tableId('poolspel', 1255101)}/${resolvedPoolId}/?user_field_names=true`, { headers });
    if (!poolResponse.ok) throw new Error('Poolspel kunde inte läsas');
    const pool = await poolResponse.json();
    const links = Array.isArray(pool.Lag) ? pool.Lag : [];
    const ids = links.map(x => Number(typeof x === 'object' ? x?.id : x));
    if (!Number.isSafeInteger(lagNo) || lagNo <= 0) throw new Error('Ogiltigt lagnummer');
    const count = Number(pool['Antal lag']);
    if (!Number.isSafeInteger(count) || count < 1 || lagNo > count) throw new Error('Ogiltigt lagnummer för poolspelet');
    const teamId = ids.length === 1 ? ids[0] : ids[lagNo - 1];
    if (!Number.isSafeInteger(teamId) || teamId <= 0 || ids.some(id => !Number.isSafeInteger(id) || id <= 0))
      throw new Error('Poolspel saknar angivet lag');
    const teamResponse = await fetchImpl(`${base}${tableId('lag', 1255083)}/${teamId}/?user_field_names=true`, { headers });
    if (!teamResponse.ok) throw new Error('Lag kunde inte verifieras');
    const team = await teamResponse.json();
    if (Number(team.id) !== teamId || typeof team.Namn !== 'string' || !team.Namn.trim())
      throw new Error('Lagets identitet kunde inte verifieras');
    return { teamId: team.Namn, teamName: team.Namn, baserowTeamRowId: String(team.id), poolId: resolvedPoolId };
  };
}
