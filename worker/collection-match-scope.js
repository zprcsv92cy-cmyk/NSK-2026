// Request-local selectors narrow data reads; ownership authorization remains separate.
const fields={
 matchkonfiguration:{pool_id:['Poolspel','link_row_has'],lag_no:['Lagnummer','equal'],match_no:['Matchnummer','equal']},
 bytesschema:{pool_id:['Poolspel','link_row_has'],lag_no:['Lagnummer','equal'],match_no:['Matchnummer','equal']},
 laguppstallningar:{pool_id:['Poolspel','link_row_has'],match_config_id:['Matchkonfiguration','link_row_has']}
};
export function parseCollectionMatchScope(url,table){
 const scope={};
 for(const key of Object.keys(fields[table]||{})){
  const values=url.searchParams.getAll(key);if(!values.length)continue;
  if(values.length!==1||! /^[1-9]\d*$/.test(values[0])||!Number.isSafeInteger(Number(values[0])))throw Error('Invalid match scope');
  scope[key]=Number(values[0]);
 }
 return scope;
}
export function collectionMatchFilters(table,scope={}){
 const filters=Object.entries(scope).map(([key,value])=>{
  const field=fields[table]?.[key];
  if(!field||!Number.isSafeInteger(value)||value<1)throw Error('Invalid match scope');
  return {field:field[0],type:field[1],value:String(value)};
 });
 return filters.length?{filter_type:'AND',filters,groups:[]}:null;
}
export function matchesCollectionMatchScope(row,table,scope={}){
 return Object.entries(scope).every(([key,value])=>{
  const [field,type]=fields[table][key];
  if(type==='equal')return Number(row[field])===value;
  const links=row[field];return Array.isArray(links)&&links.length===1&&Number(typeof links[0]==='object'?links[0]?.id:links[0])===value;
 });
}
