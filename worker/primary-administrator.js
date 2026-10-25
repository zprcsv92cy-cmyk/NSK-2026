// Fixed to the already verified account, never to a browser claim or email alone.
export const PRIMARY_ADMIN_ID='f8a37a60-2c41-4b0d-8d3b-69ac843f2e10';
export const PRIMARY_ADMIN_EMAIL='peter_hasselberg@hotmail.com';
export const ALL_ACCOUNT_PERMISSIONS=Object.freeze(['read','pool:create','lineup:edit','shifts:check','match:manage','pool:finish','pool:reopen','roster:manage','users:manage']);
export function isPrimaryAdministrator(user){return user?.id===PRIMARY_ADMIN_ID&&String(user?.email||'').trim().toLowerCase()===PRIMARY_ADMIN_EMAIL;}
export function withPrimaryAdministrator(actor,user){
 const primary=isPrimaryAdministrator(user);
 if(!primary)return actor;
 const memberships=(actor.memberships||[]).map(m=>({...m,role:'owner'}));
 if(!memberships.some(m=>m.team_id==='NSK Team 18'))memberships.push({team_id:'NSK Team 18',role:'owner'});
 return {...actor,is_primary_admin:true,is_global_admin:true,memberships,permissions:[...ALL_ACCOUNT_PERMISSIONS]};
}
