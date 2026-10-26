// Keep each page's existing scripts isolated while the outer navigation stays mounted.
(() => {
 const root=new URL('./',document.currentScript.src),pages=new Set(['startsida','truppen','traningsgrupper','ovningsarkiv','ritverktyg','skapapoolspel','malvaktsstatistik','materialforvaltare','mittkonto','anvandare','lag','laguppstallning','bytesschema','matchvy']);
 let host;try{host=window.parent!==window?window.parent.NSKAppShell:null;}catch{}
 if(!host){
  if(window.parent!==window)return;
  const path=location.pathname.slice(root.pathname.length).replace(/\/index\.html$/,'/').replace(/\/$/,'');
  if(location.pathname.startsWith(root.pathname)&&pages.has(path)){
   document.documentElement.style.visibility='hidden';
   const url=new URL('app/',root);url.searchParams.set('view',location.pathname+location.search+location.hash);location.replace(url.href);
  }
  return;
 }
 history.scrollRestoration='manual';
 window.NSKShellHost=host;window.NSKShellActive=false;
 const style=document.createElement('style');style.textContent='body.nsk-arena .arena-brand,body.nsk-arena .mainmenu,body.nsk-arena>.arena-bottom{display:none!important}body.nsk-arena{padding-top:0!important}body.nsk-arena>.arena-scroll{padding-top:14px}body.nsk-arena.rink-fullscreen>.arena-scroll{padding-top:0!important}@media(max-width:760px){body.nsk-arena:not(.rink-fullscreen) .draw-stage{height:calc(var(--nsk-app-height,100dvh) - 185px);min-height:390px}}@media print{body.nsk-arena>.arena-scroll{padding:0!important}}';document.head.append(style);
 window.NSKNavigate=(url,options={})=>host.navigate(new URL(url,location.href).href,options);
 // Track in-flight writes so an inactive page is not evicted while saving.
 const nativeInterval=window.setInterval;window.setInterval=function(callback,delay,...args){if(typeof callback!=='function')return nativeInterval.call(window,callback,delay,...args);return nativeInterval.call(window,()=>{if(window.NSKShellActive!==false&&!document.hidden)callback.apply(window,args);},delay);};
 const nativeFetch=window.fetch;
 window.fetch=async function(input,options){
  const method=String(options?.method||(input instanceof Request?input.method:'GET')).toUpperCase(),write=!['GET','HEAD','OPTIONS'].includes(method);
  if(write)host.writing(window,1);else host.reading?.(window,1);
  try{const response=await nativeFetch.call(this,input,options);if(write&&response.ok)host.changed(window);return response;}
  finally{if(write)host.writing(window,-1);else host.reading?.(window,-1);}
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
  document.addEventListener('input',event=>{if(event.target.matches('input:not([type=password]),textarea,select'))host.dirty(window);});
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
