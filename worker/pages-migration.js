// Enable only after the nsk18.pages.dev project is owned and its deployment verified.
const oldOrigin='https://zprcsv92cy-cmyk.github.io';
const pagesOrigin='https://nsk18.pages.dev';
export function publicAppRoot(env){return env?.NSK_PAGES_MIGRATION_ENABLED==='true'&&env.NSK_ISOLATED_MODE!=='true'?pagesOrigin+'/':oldOrigin+'/NSK-2026/';}
export function withPagesOrigin(original){
 return async function(request,env,ctx){
  const enabled=env?.NSK_PAGES_MIGRATION_ENABLED==='true'&&env.NSK_ISOLATED_MODE!=='true';
  if(!enabled||request.headers.get('Origin')!==pagesOrigin)return original.call(this,request,env,ctx);
  // Existing inner handlers retain every identity, team and permission check.
  // Normalize only this explicitly enabled, exact origin to their legacy allowlist.
  const headers=new Headers(request.headers);headers.set('Origin',oldOrigin);
  const normalized=new Request(request,{headers});
  const response=await original.call(this,normalized,env,ctx),output=new Headers(response.headers);
  if(output.get('Access-Control-Allow-Origin')===oldOrigin)output.set('Access-Control-Allow-Origin',pagesOrigin);
  const vary=new Set((output.get('Vary')||'').split(',').map(x=>x.trim()).filter(Boolean));vary.add('Origin');output.set('Vary',[...vary].join(', '));
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:output});
 };
}
