import {handleTeamAuth} from './team-auth.js';
import assets from './isolated-test-assets.json' with {type:'json'};
const commit='58a9131bc912b3a4d6c37b517852e09bfb76deab';
const origin='https://nsk-api-preview.pages.dev';
const reply=(text,status=200,type='text/plain; charset=utf-8')=>new Response(text,{status,headers:{'content-type':type,'cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'}});
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.origin!==origin)return reply('Test site unavailable on this hostname',404);
 if(request.headers.has('Origin')&&request.headers.get('Origin')!==origin)return reply('Forbidden origin',403);
 if(url.pathname==='/config.js')return reply(`window.APP_CONFIG={API_URL:location.origin+'/test-api',AUTH_URL:location.origin,POOL_FLOW_ENABLED:true,POOL_REMOVAL_STATE_ENABLED:true,REQUIRE_SCOPED_ROSTER_READS:true,REQUIRE_SCOPED_TEAM_READS:true,REQUIRE_SCOPED_COLLECTION_READS:true,REQUIRE_PERSONAL_POOL_WRITES:true,REQUIRE_PERSONAL_MATCH_WRITES:true,REQUIRE_PERSONAL_ROSTER_WRITES:true,REQUIRE_PERSONAL_COACH_SELECTION:true,APP_VERSION:'isolated-${commit}'};` ,200,'application/javascript');
 if(url.pathname==='/sw.js')return reply(`self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));`,200,'application/javascript');
 if(url.pathname.startsWith('/api/auth/')){
  if(!['/api/auth/login','/api/auth/logout','/api/auth/me','/api/auth/feature-access','/api/auth/navigation'].includes(url.pathname))return reply('Unavailable in test site',404);
  return handleTeamAuth(request,{AUTH_DB:env.AUTH_DB});
 }
 if(url.pathname.startsWith('/test-api/api/')){
  if(!env.ISOLATED_API)return reply('Isolated API binding missing',503);
  const target=new URL('https://nsk-api-isolated-preview.peter-hasselberg.workers.dev');target.pathname=url.pathname.slice('/test-api'.length);target.search=url.search;
  const headers=new Headers(request.headers);headers.delete('cookie');headers.delete('origin');headers.delete('referer');
  return env.ISOLATED_API.fetch(new Request(target,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
 }
 if(!['GET','HEAD'].includes(request.method))return reply('Method not allowed',405);
 let path=url.pathname.slice(1);if(!path||path.endsWith('/'))path+='index.html';
 if(!assets.includes(path))return reply('Not found',404);
 const upstream=await fetch('https://nsk18.pages.dev/'+path,{redirect:'follow'});
 if(!upstream.ok)return reply('Test asset unavailable',502);
 const ext=path.split('.').pop(),types={html:'text/html; charset=utf-8',js:'application/javascript',mjs:'application/javascript',css:'text/css',json:'application/json',png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',webmanifest:'application/manifest+json'};
 let body=upstream.body;
 if(ext==='html')body=(await upstream.text()).replace('<body','<body data-isolated-test="true"').replace('</body>','<div style="position:fixed;top:0;right:0;z-index:999999;background:#facc15;color:#111;padding:3px 9px;font:12px sans-serif;pointer-events:none">TESTMILJÖ · Syntetiska data</div></body>');
 return new Response(request.method==='HEAD'?null:body,{headers:{'content-type':types[ext]||'application/octet-stream','cache-control':'no-store','x-robots-tag':'noindex, nofollow','x-content-type-options':'nosniff'}});
}};
