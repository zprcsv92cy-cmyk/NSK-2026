// Migration inventory for existing NSK API write routes.
// This is a pure policy mapping: it does not install middleware or enable writes.
// All routes require a separately authenticated actor and server-verified team ID.
const rules=Object.freeze([
  ['POST','/api/spelare','roster'],['PATCH','/api/spelare/:id','roster'],
  ['POST','/api/tranare','roster'],['PATCH','/api/tranare/:id','roster'],
  ['POST','/api/lagpersonal','roster'],['PATCH','/api/lagpersonal','roster'],
  ['POST','/api/poolspel','pool'],['PATCH','/api/poolspel/:id','matches'],
  ['PATCH','/api/poolspel/:id/aktiv','pool_finish'],
  ['POST','/api/matchkonfiguration','matches'],['PATCH','/api/matchkonfiguration/:id','matches'],
  ['POST','/api/laguppstallningar/:id','lineup'],
  ['POST','/api/coach-selection','lineup'],
  ['POST','/api/bytesschema/save','shifts'],
  ['PATCH','/api/bytesschema/:id/done','shifts']
]);
function match(pattern,path){
 const p=pattern.split('/'),v=path.split('/');
 return p.length===v.length&&p.every((part,i)=>part.startsWith(':')?/^[1-9][0-9]*$/.test(v[i]):part===v[i]);
}
export function legacyWriteFeature(method,path){
 if(typeof method!=='string'||typeof path!=='string'||!path.startsWith('/api/'))return null;
 const verb=method.toUpperCase();
 const matches=rules.filter(([m,p])=>m===verb&&match(p,path));
 return matches.length===1?matches[0][2]:null;
}
export const LEGACY_WRITE_RULES=rules;
