// Persistent chrome and isolated, retained page documents. No database responses are cached here.
(() => {
 const root=new URL('./',document.currentScript.src),pages=new Set(['startsida','truppen','traningsgrupper','ovningsarkiv','ritverktyg','skapapoolspel','malvaktsstatistik','materialforvaltare','mittkonto','skills','anvandare','lag','laguppstallning','bytesschema','matchvy']);
 const flow=new Set(['lag','laguppstallning','bytesschema','matchvy']),KEY='nsk_shell_ui_v1',contextKeys=['nsk2_pool_id','nsk2_lag_nr','nsk2_match_no','nsk2_edit_pool_id'];
 history.scrollRestoration='manual';
 const entries=new Map();let active=null,pending=null,sequence=0,viewSequence=0,scope='',saved={},lastRoutes={},saveTimer=0,signedOut=false;
 const status=(text)=>{const node=document.getElementById('shellStatus');node.textContent=text;node.hidden=!text;};
 function route(value){try{const url=new URL(value,location.href);if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return null;const slug=url.pathname.slice(root.pathname.length).replace(/\/index\.html$/,'/').replace(/\/$/,'');if(!pages.has(slug))return null;url.pathname=root.pathname+slug+'/';return {url,slug};}catch{return null;}}
 const context=()=>Object.fromEntries(contextKeys.map(k=>[k,sessionStorage.getItem(k)||'']));
 const keyFor=(r,ctx)=>r.url.pathname+r.url.search+(flow.has(r.slug)?JSON.stringify([ctx.nsk2_pool_id,ctx.nsk2_lag_nr,ctx.nsk2_match_no]):r.slug==='skapapoolspel'?':edit='+ctx.nsk2_edit_pool_id:'');
 const find=source=>[...entries.values()].find(e=>e.frame.contentWindow===source);
 function scrolling(doc){const box=doc.querySelector('.arena-scroll');return box&&getComputedStyle(box).display!=='contents'?box:doc.scrollingElement;}
 function detailKey(d){return d.id?'id:'+d.id:d.dataset.viewKey?'key:'+d.dataset.viewKey:d.dataset.checklistId?'checklist:'+d.dataset.checklistId:d.dataset.requestId?'request:'+d.dataset.requestId:d.dataset.date?'date:'+d.dataset.date:d.querySelector(':scope > summary')?'summary:'+d.querySelector(':scope > summary').textContent.trim().slice(0,100):null;}
 function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{const rows=Object.entries(saved).slice(-40);sessionStorage.setItem(KEY,JSON.stringify({scope,lastRoutes,views:Object.fromEntries(rows)}));}catch{}},120);}
 function remember(source){if(signedOut)return;const e=find(source);if(!e||!e.ready||e.restoring||e.restorePending||e.ui&&!e.scrollRestored&&e.ui.scroll>0)return;const doc=e.frame.contentDocument,details={...(e.ui?.details||{})};for(const d of doc.querySelectorAll('details:not(.arena-more)')){const k=detailKey(d);if(k)details[k]=d.open;}const choices={};for(const panel of doc.querySelectorAll('[data-selected-lag]')){const k=detailKey(panel.closest('details'));if(k)choices[k]=panel.dataset.selectedLag;}e.ui={scroll:scrolling(doc)?.scrollTop||0,details,choices};saved[e.key]=e.ui;persist();}
 function restore(source){const e=find(source);if(!e||!e.ui)return;const doc=e.frame.contentDocument;e.restoring=true;try{
  for(const d of doc.querySelectorAll('details:not(.arena-more)')){if(e.restored.has(d))continue;const k=detailKey(d);if(k&&Object.hasOwn(e.ui.details||{},k))d.open=e.ui.details[k];e.restored.add(d);}
  for(const panel of doc.querySelectorAll('[data-selected-lag]')){if(e.choicesRestored.has(panel))continue;const k=detailKey(panel.closest('details')),value=e.ui.choices?.[k];if(value&&panel.querySelector('[data-pool-team-choice="'+CSS.escape(value)+'"]')){panel.dataset.selectedLag=value;for(const b of panel.querySelectorAll('[data-pool-team-choice]')){const selected=b.dataset.poolTeamChoice===value;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected));}}e.choicesRestored.add(panel);}
  const box=doc.querySelector('body>.arena-scroll')?scrolling(doc):null;if((!e.scrollRestored||e.restorePending)&&box&&box.scrollHeight-box.clientHeight>=e.ui.scroll){box.scrollTop=e.ui.scroll;e.scrollRestored=true;}
 }finally{e.restoring=false;}}
 function settle(e){clearTimeout(e.restoreTimer);if(!e.ready||e.reads)return;e.restoreTimer=setTimeout(()=>{if(e.reads||!e.restorePending)return;restore(e.frame.contentWindow);e.restorePending=false;activate(e,e.requestId,e.everActive?{...e.options,history:false}:e.options);remember(e.frame.contentWindow);},200);}
 function remove(e){remember(e.frame.contentWindow);entries.delete(e.key);e.frame.remove();clearTimeout(e.timeout);clearTimeout(e.restoreTimer);}
 function prune(){const disposable=[...entries.values()].filter(e=>e!==active&&e!==pending&&!e.dirty&&!e.writes).sort((a,b)=>a.used-b.used);while(entries.size>5&&disposable.length)remove(disposable.shift());}
 function selection(e){document.title=e.frame.contentDocument?.title||'NSK Team 18';window.NSKNavigation?.select(e.route.slug);document.body.classList.toggle('shell-fullscreen',e.frame.contentDocument?.body?.classList.contains('rink-fullscreen')===true);}
 function activate(e,requestId,options){
  if(requestId!==sequence||signedOut)return;
  if(active&&active!==e){remember(active.frame.contentWindow);active.frame.contentWindow.NSKShellActive=false;active.frame.contentWindow.dispatchEvent(new Event('nsk:page-hide'));active.frame.dataset.active='false';active.frame.inert=true;active.frame.setAttribute('aria-hidden','true');}
  const returning=e.everActive;active=e;pending=null;e.everActive=true;e.used=Date.now();e.frame.contentWindow.NSKShellActive=true;e.frame.dataset.active='true';e.frame.inert=false;e.frame.setAttribute('aria-hidden','false');
  if(options.history!==false&&(options.replace||location.href!==e.route.url.href)){const method=options.replace?'replaceState':'pushState';history[method]({nskShell:true,entryId:e.id,context:e.context},'',e.route.url.pathname+e.route.url.search+e.route.url.hash);}
  lastRoutes[e.route.slug]=e.route.url.pathname+e.route.url.search+e.route.url.hash;persist();
  selection(e);restore(e.frame.contentWindow);
  if(e.route.slug==='traningsgrupper'){const attendance=e.frame.contentDocument?.getElementById('trainingAttendance');if(attendance)attendance.open=true;}
  status('');clearTimeout(e.timeout);
  document.querySelector('.arena-more')?.removeAttribute('open');
  if(returning){e.frame.contentWindow.dispatchEvent(new Event('focus'));e.frame.contentDocument.dispatchEvent(new Event('nsk:page-show'));}
  if(options.focus)e.frame.focus({preventScroll:true});prune();
 }
 async function navigate(value,options={}){
  if(signedOut)return;
  let target=route(value);if(options.fromMenu&&target?.slug==='traningsgrupper'&&!target.url.search){const recent=route(lastRoutes.traningsgrupper);if(recent?.slug==='traningsgrupper')target=recent;}if(!target){location.assign(new URL(value,location.href).href);return;}
  if(options.reloadApp){location.replace(target.url.href);return;}
  const requestId=++sequence;
  if(pending&&!pending.ready&&!pending.dirty&&!pending.writes){remove(pending);pending=null;}
  // Flush focused inline editors before leaving; their page remains alive during saving.
  if(active&&active.frame.contentDocument?.activeElement?.matches('input,textarea,select'))active.frame.contentDocument.activeElement.blur();
  const ctx=options.context||context();if(options.context&&(flow.has(target.slug)||target.slug==='skapapoolspel'))for(const k of contextKeys.filter(k=>k!=='nsk2_edit_pool_id'||target.slug==='skapapoolspel')){if(ctx[k])sessionStorage.setItem(k,ctx[k]);else sessionStorage.removeItem(k);}
  const key=keyFor(target,ctx);let e=options.entryId?[...entries.values()].find(item=>item.id===options.entryId&&item.route.slug===target.slug):entries.get(key);
  if(options.reload&&e){remove(e);if(e===active)active=null;e=null;}
  if(e?.stale&&!e.dirty&&!e.writes&&e!==active){remove(e);e=null;}
  if(e?.ready&&!e.restorePending){activate(e,requestId,options);return;}
  if(!e){
   const frame=document.createElement('iframe');frame.className='shell-view';frame.title=target.slug==='startsida'?'Kalender':target.slug==='truppen'?'Truppen':'NSK – '+target.slug;frame.dataset.active='false';frame.inert=true;frame.setAttribute('aria-hidden','true');
   e={id:'view-'+(++viewSequence),frame,route:target,context:ctx,key,ui:saved[key]||null,restorePending:!!saved[key],reads:0,restored:new WeakSet(),choicesRestored:new WeakSet(),scrollRestored:false,ready:false,dirty:false,writes:0,used:Date.now(),requestId,options};entries.set(key,e);pending=e;
   frame.addEventListener('load',()=>{
    let url;try{url=new URL(frame.contentWindow.location.href);}catch{signedOutNow();return;}
    if(url.href==='about:blank')return;
    const loaded=route(url.href);if(!loaded){signedOutNow();return;}
    // Native reloads and legacy redirects still stay inside the outer chrome.
    if(loaded.url.pathname!==e.route.url.pathname||loaded.url.search!==e.route.url.search){const next=url.href;remove(e);if(active===e)active=null;void navigate(next,{replace:true});return;}
    if(frame.contentDocument.documentElement.style.visibility!=='hidden')ready(frame.contentWindow);
   });
   frame.src=target.url.href;document.getElementById('shellViews').append(frame);
  }else{e.requestId=requestId;e.options=options;pending=e;}
  status('Öppnar '+(target.slug==='startsida'?'Kalender':target.slug==='truppen'?'Truppen':'sidan')+'…');
  e.timeout=setTimeout(()=>{if(pending===e&&requestId===sequence){status('Sidan tar längre tid att öppna. Du kan välja en annan sida.');}},15000);
 }
 function ready(source){const e=find(source);if(!e||e.document===source.document)return;const loaded=route(source.location.href);if(!loaded||loaded.url.pathname!==e.route.url.pathname||loaded.url.search!==e.route.url.search)return;e.document=source.document;e.ready=true;restore(source);settle(e);if(!e.restorePending)activate(e,e.requestId,e.everActive?{...e.options,history:false}:e.options);}
 function signedOutNow(){if(signedOut)return;signedOut=true;sequence++;clearTimeout(saveTimer);try{sessionStorage.removeItem(KEY);}catch{}for(const e of entries.values())e.frame.remove();entries.clear();const login=new URL('login/',root);if(active)login.searchParams.set('next',active.route.url.pathname+active.route.url.search);location.replace(login.href);}
 window.NSKAppShell={navigate,ready,remember,restore,signedOut:signedOutNow,
  reading(source,delta){const e=find(source);if(e){e.reads=Math.max(0,e.reads+delta);if(e.reads)clearTimeout(e.restoreTimer);else settle(e);}},
  writing(source,delta){const e=find(source);if(e){e.writes=Math.max(0,e.writes+delta);if(!e.writes)prune();}},
  changed(source){for(const e of entries.values())if(e.frame.contentWindow!==source)e.stale=true;},
  dirty(source){const e=find(source);if(e)e.dirty=true;},
  clean(source){const e=find(source);if(e){e.dirty=false;prune();}},
  interacting(source){const e=find(source);if(e){e.restorePending=false;clearTimeout(e.restoreTimer);e.scrollRestored=true;for(const d of e.frame.contentDocument.querySelectorAll('details'))e.restored.add(d);for(const panel of e.frame.contentDocument.querySelectorAll('[data-selected-lag]'))e.choicesRestored.add(panel);}},
  fullscreen(source,on){if(active?.frame.contentWindow===source)document.body.classList.toggle('shell-fullscreen',on);},
  contextChanged(source){const e=find(source);if(e!==active||pending||!flow.has(e.route.slug))return;const next=context(),key=keyFor(e.route,next);if(key!==e.key){const duplicate=entries.get(key);if(duplicate&&duplicate!==e){if(!duplicate.dirty&&!duplicate.writes)remove(duplicate);else{entries.delete(duplicate.key);duplicate.key+=':held:'+duplicate.id;entries.set(duplicate.key,duplicate);}}entries.delete(e.key);e.context=next;e.key=key;entries.set(key,e);history.replaceState({nskShell:true,entryId:e.id,context:next},'',location.href);}}
 };
 document.addEventListener('click',event=>{
  const link=event.target.closest?.('a[href]');if(event.defaultPrevented||!link||event.button!==0||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||link.target&&link.target!=='_self'||link.hasAttribute('download'))return;
  if(!route(link.href))return;event.preventDefault();void navigate(link.href,{focus:true,fromMenu:true});
 });
 window.addEventListener('popstate',event=>void navigate(location.href,{history:false,entryId:event.state?.entryId,context:event.state?.context}));
 window.addEventListener('pagehide',()=>{if(signedOut||!Auth.getToken())return;if(active)remember(active.frame.contentWindow);clearTimeout(saveTimer);try{sessionStorage.setItem(KEY,JSON.stringify({scope,lastRoutes,views:saved}));}catch{}});
 async function start(){
  const initial=new URL(location.href).searchParams.get('view'),target=route(initial||location.href)||route(new URL('startsida/',root));
  try{const identity=await Auth.init();if(!identity||!Auth.activeTeam()){signedOutNow();return;}
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([Auth.getToken(),identity.user.id,Auth.activeTeam(),identity.permissions,identity.memberships,window.NSK_VERSION])));scope=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   try{const old=JSON.parse(sessionStorage.getItem(KEY)||'null');if(old?.scope===scope&&old.views&&typeof old.views==='object'){saved=old.views;lastRoutes=old.lastRoutes||{};}}catch{}
   await navigate(target.url.href,{replace:true});
  }catch{status('Appen kunde inte öppnas. Kontrollera anslutningen och ladda om sidan.');}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else void start();
})();
