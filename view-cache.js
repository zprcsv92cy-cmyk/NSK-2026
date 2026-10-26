// Presentation snapshots only. Database reads used by writes and live matches stay fresh.
(() => {
 const KEY='nsk_view_cache_v1',MAX_AGE=5*60*1000;
 let epoch=0;const tickets=new Map();
 const signature=()=>{
  const auth=window.Auth,session=auth?.getSession?.(),team=auth?.activeTeam?.();
  if(!session?.user?.id||!team||!auth.getToken?.()||!auth.can?.('read',team))return null;
  return JSON.stringify([auth.getToken(),session.user.id,team,session.permissions?.slice().sort(),session.memberships,window.APP_CONFIG?.API_URL,window.NSK_VERSION]);
 };
 function clear(){epoch++;tickets.clear();try{sessionStorage.removeItem(KEY);}catch{}}
 function read(){try{return JSON.parse(sessionStorage.getItem(KEY)||'{}')||{};}catch{return {};}}
 async function open(name){
  const initial=signature(),generation=epoch,ticket=(tickets.get(name)||0)+1;tickets.set(name,ticket);
  const current=()=>!!initial&&generation===epoch&&tickets.get(name)===ticket&&signature()===initial;
  let key;
  if(initial&&window.crypto?.subtle){const digest=await window.crypto.subtle.digest('SHA-256',new TextEncoder().encode(initial));key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')+':'+name;}
  const entry=key&&current()?read()[key]:null;
  const data=entry&&Number.isFinite(entry.time)&&Date.now()-entry.time>=0&&Date.now()-entry.time<MAX_AGE?entry.data:null;
  return {data,current,save(value){
   if(!key||!current())return;
   try{const entries=read(),now=Date.now();for(const k of Object.keys(entries))if(!entries[k]||now-entries[k].time>MAX_AGE)delete entries[k];entries[key]={time:now,data:value};const text=JSON.stringify(entries);if(text.length<1500000)sessionStorage.setItem(KEY,text);}catch{}
  }};
 }
 // Keep existing details, inputs and focus. Keyed cards may already live in the combined calendar.
 function patch(root,html,external=[]){
  const fromNodes=typeof html!=='string',template=document.createElement('template');if(!fromNodes)template.innerHTML=html;const content=fromNodes?html:template.content;
  const keyed=new Map([...root.querySelectorAll('[data-view-key]'),...external].map(n=>[n.dataset.viewKey,n]));
  const wanted=new Set([...content.querySelectorAll('[data-view-key]')].map(n=>n.dataset.viewKey));
  const scroll=document.querySelector('.arena-scroll')||document.scrollingElement,top=scroll?.scrollTop;
  function sync(parent,source){
   let cursor=parent.firstChild;
   for(const fresh of [...source.childNodes]){
    const key=fresh.nodeType===1?fresh.dataset.viewKey:null;
    let node=key?keyed.get(key):cursor;
    if(!node||node.nodeType!==fresh.nodeType||node.nodeName!==fresh.nodeName||(node.nodeType===1&&node.dataset.viewKey!==key&&!!(node.dataset.viewKey||key)))node=fresh.cloneNode(true);
    if(node!==cursor)parent.insertBefore(node,cursor);
    if(key&&node.dataset.viewRevision&&node.dataset.viewRevision===fresh.dataset.viewRevision){cursor=node.nextSibling;continue;}
    if(node.nodeType===3){if(node.nodeValue!==fresh.nodeValue)node.nodeValue=fresh.nodeValue;}
    else if(node.nodeType===1){
     const retained=new Set(['open','data-selected-lag']);if(node.matches('[data-pool-team-choice]')){retained.add('class');retained.add('aria-pressed');}
     if(fromNodes){node.onclick=fresh.onclick;node.onchange=fresh.onchange;}
     const editing=node===document.activeElement&&node.matches('input:not([type=checkbox]):not([type=radio]),textarea,select,[contenteditable]');
     if(!editing){
      for(const a of [...node.attributes])if(!retained.has(a.name)&&!fresh.hasAttribute(a.name))node.removeAttribute(a.name);
      for(const a of [...fresh.attributes])if(!retained.has(a.name)&&node.getAttribute(a.name)!==a.value)node.setAttribute(a.name,a.value);
      if(node.matches('input')){node.value=fresh.value;node.checked=fresh.checked;}
      if(!(node.matches('[data-training-info]')&&!fresh.textContent))sync(node,fresh);
     }
    }
    cursor=node.nextSibling;
   }
   while(cursor){const next=cursor.nextSibling;cursor.remove();cursor=next;}
  }
  sync(root,content);
  for(const node of external)if(!wanted.has(node.dataset.viewKey))node.remove();
  if(scroll&&Number.isFinite(top))scroll.scrollTop=top;
 }
 function denied(error){return error?.status===401||error?.status===403||/API-fel.*\b(?:401|403)\b/.test(error?.message||'');}
 window.NSKViewCache={open,clear,patch,denied};
})();
