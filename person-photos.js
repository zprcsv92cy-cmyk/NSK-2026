// Private profile photos: authenticated reads, in-memory object URLs, shared across cards and roster.
(() => {
 const logo='../icon-192.png',mounted=new Set(),metadata=new Map(),loads=new Map(),urls=new Map();let session=null;
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 const token=()=>window.Auth?.getToken?.()||null;
 function reset(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();loads.clear();metadata.clear();session=token();for(const image of mounted)fallback(image);}
 function ensureSession(){if(session!==token())reset();return session;}
 function fallback(image){image.classList.remove('has-profile-photo');if(image.getAttribute('src')!==logo)image.src=logo;}
 async function request(path,team,payload){const expected=ensureSession();if(!expected)throw Error('Logga in först.');const response=await fetch(base()+path+(path.includes('?')?'&':'?')+'team_id='+encodeURIComponent(team),{method:payload===undefined?'GET':'PUT',headers:{Authorization:'Bearer '+expected,...(payload===undefined?{}:{'Content-Type':'application/json'})},body:payload===undefined?undefined:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json();if(token()!==expected)throw Error('Inloggningen ändrades. Öppna kortet igen.');if(!response.ok||data.ok!==true){const error=Error(data.error||'Profilbilden kunde inte hämtas eller sparas.');error.status=response.status;throw error;}return data;}
 const path=(kind,id)=>'/api/person-photo?kind='+encodeURIComponent(kind)+'&person_id='+encodeURIComponent(id);
 const personKey=(team,kind,id)=>JSON.stringify([team,kind,String(id)]);
 async function refresh(team,force=false){ensureSession();if(!session)return;let state=metadata.get(team);if(!state){state={rows:[],checked:0,pending:null};metadata.set(team,state);}if(state.pending){await state.pending;if(!force)return;}
  if(!force&&Date.now()-state.checked<1000)return;
  const expected=session;state.pending=(async()=>{const data=await request('/api/person-photos',team);if(session!==expected)return;if(!Array.isArray(data.photos))throw Error('Ogiltigt bildsvar.');const rows=new Map(state.rows.map(r=>[r.kind+':'+r.personId,r]));for(const row of data.photos){const key=row.kind+':'+row.personId;if(!rows.has(key)||row.revision>=rows.get(key).revision)rows.set(key,row);}state.rows=[...rows.values()];state.checked=Date.now();await paint(team);})();try{await state.pending;}finally{state.pending=null;}
 }
 async function imageUrl(team,kind,id,revision){const key=personKey(team,kind,id)+':'+revision;if(urls.has(key))return urls.get(key);if(loads.has(key))return loads.get(key);const expected=session;
  const pending=(async()=>{const data=await request(path(kind,id),team);if(!data.photo||data.revision!==revision||expected!==token())return null;const bytes=Uint8Array.from(atob(data.photo),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));if(expected!==token()){URL.revokeObjectURL(url);return null;}urls.set(key,url);return url;})();loads.set(key,pending);try{return await pending;}finally{loads.delete(key);}
 }
 async function paint(team){const state=metadata.get(team);if(!state)return;const tasks=[];for(const image of mounted){if(image.isConnected===false){mounted.delete(image);continue;}const [imageTeam,kind,id]=JSON.parse(image.dataset.personPhoto);if(imageTeam!==team)continue;const row=state.rows.find(r=>r.kind===kind&&String(r.personId)===id);if(!row?.hasPhoto){fallback(image);continue;}const identity=image.dataset.personPhoto,expected=session;tasks.push(imageUrl(team,kind,id,row.revision).then(url=>{if(image.dataset.personPhoto!==identity||expected!==token()||metadata.get(team)?.rows.find(r=>r.kind===kind&&String(r.personId)===id)?.revision!==row.revision)return;if(url){image.src=url;image.classList.add('has-profile-photo');}else fallback(image);}).catch(()=>fallback(image)));}await Promise.all(tasks);
  // Revoke only versions no longer referenced by an image or the current manifest.
  const active=new Set([...mounted].map(image=>image.getAttribute('src')));for(const [key,url] of urls)if(!active.has(url)){URL.revokeObjectURL(url);urls.delete(key);}
 }
 function mount(image,team,kind,id){ensureSession();const identity=personKey(team,kind,id);if(image.dataset.personPhoto===identity&&mounted.has(image))return;image.dataset.personPhoto=identity;image.classList.add('person-profile-photo');image.onerror=()=>fallback(image);fallback(image);mounted.add(image);void refresh(team).then(()=>paint(team)).catch(()=>fallback(image));}
 async function get(team,kind,id){const data=await request(path(kind,id),team);if(!Number.isSafeInteger(data.revision)||data.revision<0)throw Error('Ogiltigt bildsvar.');return data;}
 async function save(team,kind,id,photo,revision){const data=await request(path(kind,id),team,{photo,revision});if(!Number.isSafeInteger(data.revision)||data.revision!==revision+1)throw Error('Bildändringen kunde inte bekräftas. Läs om kortet.');const expected=session,key=personKey(team,kind,id)+':'+data.revision;if(photo){const bytes=Uint8Array.from(atob(photo),c=>c.charCodeAt(0));urls.set(key,URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'})));}let state=metadata.get(team);if(!state){state={rows:[],checked:0,pending:null};metadata.set(team,state);}state.rows=state.rows.filter(r=>r.kind!==kind||String(r.personId)!==String(id));state.rows.push({kind,personId:String(id),revision:data.revision,hasPhoto:photo!==null});if(expected===token())await paint(team);void refresh(team,true).catch(()=>{});window.dispatchEvent(new CustomEvent('nsk:person-photo',{detail:{team,kind,id:String(id)}}));return data;}
 async function compress(file){
  if(!file||!file.type.startsWith('image/')||file.size>25*1024*1024)throw Error('Välj en bild på högst 25 MB.');
  const url=URL.createObjectURL(file);let image;try{image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error();const canvas=document.createElement('canvas');canvas.width=canvas.height=384;const ctx=canvas.getContext('2d');if(!ctx)throw Error();ctx.fillStyle='#ffffff';ctx.fillRect(0,0,384,384);const side=Math.min(image.naturalWidth,image.naturalHeight);ctx.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,384,384);
   for(const quality of [.82,.7,.58,.46,.34]){const encoded=canvas.toDataURL('image/jpeg',quality).split(',')[1];if(encoded&&encoded.length<=131072)return encoded;}throw Error('Bilden kunde inte komprimeras tillräckligt.');
  }catch(error){throw Error(error.message?.includes('komprimeras')?error.message:'Bilden kunde inte öppnas. Prova en JPEG- eller PNG-bild.');}finally{URL.revokeObjectURL(url);}
 }
 window.PersonPhotos={mount,get,save,refresh,compress,reset};
 window.addEventListener('nsk:session-changed',reset);window.addEventListener('nsk:team-changed',reset);
 const refreshMounted=()=>{ensureSession();if(document.hidden||!session)return;const teams=new Set([...mounted].map(image=>JSON.parse(image.dataset.personPhoto)[0]));for(const team of teams)void refresh(team,true).catch(()=>{});};
 window.addEventListener('focus',refreshMounted);document.addEventListener('visibilitychange',refreshMounted);
 setInterval(refreshMounted,30000);
})();
