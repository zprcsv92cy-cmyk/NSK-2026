// Shared server-side authorization policy for a future protected NSK API.
// No production route is changed by this module.
export const FEATURE_PERMISSIONS=Object.freeze({
 roster:'roster:manage',pool:'pool:create',lineup:'lineup:edit',
 shifts:'shifts:check',matches:'match:manage',pool_finish:'pool:finish',
 pool_reopen:'pool:reopen',users:'users:manage'
});
export function authorizeTeamFeature(actor,teamId,feature){
 if(!actor)return {allowed:false,status:401,reason:'Inte inloggad'};
 if(typeof teamId!=='string'||!teamId||teamId.length>100||!Object.hasOwn(FEATURE_PERMISSIONS,feature))
  return {allowed:false,status:400,reason:'Ogiltigt lag eller funktion'};
 const membership=actor.memberships?.find(x=>x.team_id===teamId);
 if(!membership)return {allowed:false,status:403,reason:'Ingen åtkomst till laget'};
 const permission=FEATURE_PERMISSIONS[feature];
 // A global personal grant never overrides a read-only team role.
 const writableRole=membership.role!=='viewer'&&membership.role!=='player';
 const allowed=writableRole&&actor.permissions?.includes(permission)===true;
 return {allowed,status:allowed?200:403,reason:allowed?'Tillåtet':'Saknar behörighet',role:membership.role,permission};
}
