// Keep each page's existing scripts isolated while the outer navigation stays mounted.
(() => {
 const root=new URL('./',document.currentScript.src),pages=new Set(['startsida','truppen','traningsgrupper','ovningsarkiv','cupplanerare','ritverktyg','skapapoolspel','malvaktsstatistik','materialforvaltare','mittkonto','skills','anvandare','lag','laguppstallning','bytesschema','matchvy']);
 // User administration uses native document scrolling for iOS form editing.
 const standalone=window.navigator?.standalone===true||window.matchMedia?.('(display-mode: standalone)')?.matches===true;
 const nativePath=new URL(standalone?'startsida/anvandare/':'anvandare/',root).pathname;
 const nativeUsers=window.parent===window&&[new URL('anvandare/',root).pathname,new URL('startsida/anvandare/',root).pathname].includes(location.pathname);
 if(nativeUsers){
  if(standalone&&location.pathname!==nativePath){location.replace(new URL(nativePath+location.search,location.origin).href);return;}
  document.documentElement.dataset.nskNativeForm='true';
  if(standalone)document.addEventListener('click',event=>{
   const link=event.target.closest?.('a[href]');if(event.defaultPrevented||!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target||link.hasAttribute('download'))return;
   const target=new URL(link.href);if(target.origin!==root.origin||!target.pathname.startsWith(root.pathname))return;
   const slug=target.pathname.slice(root.pathname.length).replace(/\/$/,'');if(!pages.has(slug))return;
   event.preventDefault();const next=new URL(slug==='anvandare'?'startsida/anvandare/':'startsida/app/',root);
   if(slug!=='anvandare')next.searchParams.set('view',target.pathname+target.search+target.hash);location.assign(next.href);
  });return;
 }
 let host;try{host=window.parent!==window?window.parent.NSKAppShell:null;}catch{}
 if(!host){
  if(window.parent!==window)return;
  const path=location.pathname.slice(root.pathname.length).replace(/\/index\.html$/,'/').replace(/\/$/,'');
  if(location.pathname.startsWith(root.pathname)&&pages.has(path)){
   document.documentElement.style.visibility='hidden';
   const url=new URL(standalone?'startsida/app/':'app/',root),view=new URL(location.href).searchParams.get('view');url.searchParams.set('view',path==='startsida'&&view?view:location.pathname+location.search+location.hash);location.replace(url.href);
  }
  return;
 }
 history.scrollRestoration='manual';
 window.NSKShellHost=host;window.NSKShellActive=false;
 const style=document.createElement('style');style.textContent='html{height:100%!important;overflow:hidden!important}body.nsk-arena .arena-brand,body.nsk-arena .mainmenu,body.nsk-arena>.arena-bottom{display:none!important}body.nsk-arena{padding:0!important;margin:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-height:none!important;min-height:0!important}body.nsk-arena>.arena-scroll{display:block!important;flex:1 1 0!important;min-height:0!important;overflow-y:auto!important;padding:14px 14px 20px!important}body.nsk-arena.rink-fullscreen>.arena-scroll{padding:0!important}@media(max-width:760px){body.nsk-arena:not(.rink-fullscreen) .draw-stage{height:calc(var(--nsk-app-height,100dvh) - 185px);min-height:390px}}@media print{body.nsk-arena>.arena-scroll{padding:0!important}}';document.head.append(style);
 window.NSKNavigate=(url,options={})=>host.navigate(new URL(url,location.href).href,options);
 // Track in-flight writes so an inactive page is not evicted while saving.
 const nativeInterval=window.setInterval;window.setInterval=function(callback,delay,...args){if(typeof callback!=='function')return nativeInterval.call(window,callback,delay,...args);return nativeInterval.call(window,()=>{if(window.NSKShellActive!==false&&!document.hidden)callback.apply(window,args);},delay);};
 const nativeFetch=window.fetch;
 window.fetch=async function(input,options){
  const method=String(options?.method||(input instanceof Request?input.method:'GET')).toUpperCase(),write=!['GET','HEAD','OPTIONS'].includes(method);
  const personalMenu=String(input instanceof Request?input.url:input).split('?')[0]===String(window.APP_CONFIG?.AUTH_URL||'').replace(/\/$/,'')+'/api/auth/navigation';
  if(write)host.writing(window,1);else if(!personalMenu)host.reading?.(window,1);
  try{const response=await nativeFetch.call(this,input,options);if(write&&response.ok&&!personalMenu)host.changed(window);return response;}
  finally{if(write)host.writing(window,-1);else if(!personalMenu)host.reading?.(window,-1);}
 };
 let ready=false,observer;
 const visible=()=>{if(!ready&&document.readyState!=='loading'&&document.documentElement.style.visibility!=='hidden'){ready=true;host.ready(window);}};
 const report=()=>{host.fullscreen(window,document.body?.classList.contains('rink-fullscreen')===true);visible();};
 observer=new MutationObserver(report);observer.observe(document.documentElement,{attributes:true,attributeFilter:['style'],subtree:false});
 document.addEventListener('DOMContentLoaded',()=>{
  window.addEventListener('click',event=>{
   const link=event.target.closest?.('a[href]');
   if(event.defaultPrevented||!link||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.hasAttribute('download')||link.target&&link.target!=='_self')return;
   if(link.getAttribute('href').startsWith('#'))return;
   const url=new URL(link.href);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname)){if(['https:','http:'].includes(url.protocol)){event.preventDefault();window.NSKNavigate(url.href);}return;}
   const slug=url.pathname.slice(root.pathname.length).replace(/\/index\.html$/,'/').replace(/\/$/,'');
   if(!pages.has(slug)){if(['https:','http:'].includes(url.protocol)){event.preventDefault();window.NSKNavigate(url.href);}return;}if(url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
   event.preventDefault();window.NSKNavigate(url.href);
  });
  // Focus events do not bubble out of an iframe to the outer shell.
  for(const event of ['focusin','focusout'])document.addEventListener(event,()=>{
   window.parent.dispatchEvent(new window.parent.Event('resize'));
   setTimeout(()=>window.parent.dispatchEvent(new window.parent.Event('resize')),150);
  });
  document.addEventListener('input',event=>{if(event.target.matches('input:not([type=password]):not([type=search]),textarea,select')&&!event.target.matches('#lineupMatch,#shiftMatch,#trainingCalendar,#trainingDate,#skillsPlayer,#skillsMode,#skillsDate,#skillsColors,#skillsPool,#skillsOwnTeam,#skillsMatch,#equipmentStatusFilter,#exerciseCategory,#exerciseSource,#exerciseAge'))host.dirty(window);});
  document.addEventListener('change',()=>setTimeout(()=>{host.contextChanged(window);host.remember(window);},0));
  document.addEventListener('click',()=>setTimeout(()=>{host.contextChanged(window);host.remember(window);},0));
  document.addEventListener('scroll',()=>host.remember(window),true);
  document.addEventListener('toggle',()=>host.remember(window),true);
  document.addEventListener('pointerdown',()=>host.interacting(window),{passive:true,capture:true});
  document.addEventListener('keydown',()=>host.interacting(window),true);
  document.addEventListener('touchstart',()=>host.interacting(window),{passive:true});
  document.addEventListener('wheel',()=>host.interacting(window),{passive:true});
  new MutationObserver(()=>{host.restore(window);report();}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  host.restore(window);report();
 });
 window.addEventListener('load',visible);
})();
