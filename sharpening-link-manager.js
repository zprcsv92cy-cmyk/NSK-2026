// Personal QR tokens are fetched only with equipment authorization and held in memory.
(() => {
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 const allowed=()=>{const s=window.Auth?.getSession(),team=window.Auth?.activeTeam();return s?.is_primary_admin===true||!!s?.memberships?.some(m=>(m.team_id===team||m.team_name===team)&&m.role==='equipment');};
 function linkUrl(token){if(!/^[a-f0-9]{64}$/.test(token))throw Error('Ogiltig QR-kod');const url=new URL('../slipning/',location.href);url.hash='nyckel='+token;return url.href;}
 function openPrintPreview(sheet){
  const preview=window.open('','_blank');if(!preview)throw Error('Utskriftsvyn kunde inte öppnas. Tillåt popupfönster och tryck Skriv ut igen.');
  const doc=preview.document;doc.open();doc.write('<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NSK – QR-lista</title><style>body{margin:0;padding:20px;background:#eef1f4;color:#111;font:16px Arial,sans-serif}.toolbar{max-width:820px;margin:0 auto 20px}.toolbar h1{font-size:22px}.toolbar button{min-height:48px;padding:10px 16px;margin:0 8px 8px 0;font:inherit;border-radius:8px;border:1px solid #777;background:white;color:#111}.qr-print-sheet{display:grid;grid-template-columns:1fr 1fr;gap:10mm;max-width:186mm;margin:auto;background:white}.qr-print-card{break-inside:avoid;text-align:center;border:1px dashed #aaa;padding:8mm;min-width:0}.qr-print-card h2{font-size:15pt;overflow-wrap:anywhere}.qr-print-card img{display:block;width:50mm;height:50mm;max-width:100%;margin:4mm auto;image-rendering:pixelated}.qr-print-card p{font-size:10pt}@media screen and (max-width:600px){.qr-print-sheet{grid-template-columns:1fr;gap:16px}}@media print{@page{size:A4;margin:12mm}body{padding:0;background:white}.toolbar{display:none}.qr-print-sheet{display:grid;grid-template-columns:1fr 1fr;max-width:none}}</style></head><body><header class="toolbar"><h1>QR-lista</h1><p>Tryck på Skriv ut. På iPhone kan du också spara utskriften som PDF via delningsknappen i utskriftsvyn.</p><button id="printQr" type="button">Skriv ut / Spara PDF</button><button id="closeQr" type="button">Stäng</button><p id="printReady" role="status">Förbereder QR-koder…</p></header></body></html>');doc.close();
  doc.body.append(doc.importNode(sheet,true));const button=doc.getElementById('printQr');button.disabled=true;button.addEventListener('click',()=>{preview.focus();preview.print();});doc.getElementById('closeQr').addEventListener('click',()=>preview.close());
  const images=[...doc.images];Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))).then(()=>{if(preview.closed)return;button.disabled=false;doc.getElementById('printReady').textContent='QR-listan är klar för utskrift.';});
  preview.opener=null;preview.focus();return preview;
 }
 function bulk(root,{team,people}){
  let disposed=false,busy=false,metaBusy=false,listRecords=[],lastMeta=0;
  const token=Auth.getToken(),activeTeam=Auth.activeTeam(),states=new Map(),records=new Map(),loading=new Set(),chosen=new Set();
  const valid=()=>!disposed&&allowed()&&Auth.getToken()===token&&Auth.activeTeam()===activeTeam;
  root.replaceChildren();
  const title=el('h2','Spelarnas QR-kort'),label=el('label','Sök namn'),search=el('input');search.type='search';search.id='qrNameSearch';search.placeholder='Sök namn';label.append(search);
  const toolbar=el('div');toolbar.className='equipment-qr-toolbar';
  const create=el('button','Skapa aktuell QR-lista'),print=el('button','Skriv ut'),selectAll=el('button','Markera alla');for(const b of [create,print,selectAll])b.type='button';print.disabled=true;toolbar.append(create,print,selectAll);
  const message=el('p','Öppna ett spelarkort för att visa QR-koden.');message.id='qrBulkStatus';message.className='small';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const cards=el('div');cards.id='qrPlayers';root.append(title,label,toolbar,message,cards);
  const status=text=>{if(!disposed)message.textContent=text;};
  const currentState=id=>states.get(id)||{mode:'off',revision:0,recoverable:false};
  const recordFor=(p,data)=>({personId:String(p.id),name:p.full_name,revision:data.revision,url:linkUrl(data.token)});
  function invalidateList(){listRecords=[];print.disabled=true;}
  function accept(p,data){
   const id=String(p.id),old=states.get(id);if(old&&old.revision>data.revision)return;
   if(old&&(old.revision!==data.revision||old.mode!==data.mode)){records.delete(id);invalidateList();}
   states.set(id,{mode:data.mode,revision:data.revision,recoverable:!!data.recoverable});
   if(data.mode==='off'||!data.recoverable)records.delete(id);
   if(data.token){if(!/^[a-f0-9]{64}$/.test(data.token))throw Error('QR-koden kunde inte verifieras.');records.set(id,recordFor(p,data));}
  }
  async function request(personId,payload){
   if(!valid())throw Error('Inloggningen har ändrats. Ladda om sidan.');
   const url=base()+'/api/sharpening/link?team_id='+encodeURIComponent(team)+(personId?'&person_id='+encodeURIComponent(personId):'');
   const response=await fetch(url,{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+token,...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(15000)});
   const data=await response.json().catch(()=>({}));if(!valid())throw Error('Inloggningen har ändrats. Ladda om sidan.');
   if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'QR-uppgifterna kunde inte hämtas ('+response.status+').'),{status:response.status});return data;
  }
  async function loadOne(p){const data=await request(String(p.id));accept(p,data);return data;}
  async function metadata(force=false){
   if(!valid()||metaBusy||busy||!force&&Date.now()-lastMeta<30000)return;
   metaBusy=true;controls();status('Hämtar QR-status…');
   try{const data=await request();const byId=new Map((data.links||[]).map(s=>[String(s.personId),s]));for(const p of people)accept(p,byId.get(String(p.id))||{mode:'off',revision:0,recoverable:false});lastMeta=Date.now();status('Visa ett spelarkort, eller skapa en lista med befintliga aktiva QR-koder.');render();}
   catch(error){status(error.message);}finally{metaBusy=false;controls();}
  }
  async function reveal(p){
   const id=String(p.id);if(loading.has(id)||records.has(id)||!valid())return;loading.add(id);render();
   try{await loadOne(p);}catch(error){status(p.full_name+': '+error.message);}finally{loading.delete(id);if(valid())render();}
  }
  function controls(){create.disabled=busy||metaBusy;selectAll.disabled=busy;print.disabled=busy||!listRecords.length;selectAll.textContent=chosen.size===people.length?'Avmarkera alla':'Markera alla';}
  function qrImage(url,size=112){
   if(!window.qrcode)throw Error('QR-biblioteket kunde inte laddas. Ladda om sidan.');
   const qr=qrcode(0,'M');qr.addData(url);qr.make();const img=el('img');img.src=qr.createDataURL(5,4);img.alt='Personlig QR-kod till slipningssidan';img.width=size;img.height=size;return img;
  }
  async function share(p,record,body){
   if(!valid())return;
   try{if(navigator.share){await navigator.share({title:'Slipningslänk – '+p.full_name,url:record.url});return;}}
   catch(error){if(error.name==='AbortError')return;}
   try{await navigator.clipboard.writeText(record.url);status('Länken är kopierad för '+p.full_name+'.');}
   catch{let field=body.querySelector('[data-private-link]');if(!field){field=el('input');field.readOnly=true;field.setAttribute('data-private-link','');field.setAttribute('aria-label','Kopiera personlig slipningslänk');field.autocomplete='off';body.append(field);}field.value=record.url;field.focus();field.select();status(document.execCommand('copy')?'Länken är kopierad.':'Markera och kopiera länken i fältet.');}
  }
  async function mutate(p,mode,action){
   if(busy||!valid())return;const id=String(p.id),state=states.get(id);if(!state){status('Hämta spelarens QR-status först.');return;}
   if(action==='renew'&&state.mode!=='off'&&!confirm('Förnya QR för '+p.full_name+'? Den gamla länken slutar fungera. Pågående slipönskemål finns kvar.'))return;
   if(mode==='off'&&state.mode!=='off'&&!confirm('Stäng av slipningslänken för '+p.full_name+'? Den nuvarande QR-koden slutar fungera.'))return;
   busy=true;render();status('Sparar QR-uppgifter för '+p.full_name+'…');
   try{const data=await request(id,{mode,action,revision:state.revision});accept(p,data);invalidateList();status(action==='renew'?'Ny QR skapad för '+p.full_name+'.':mode==='off'?'Länken är avstängd.':'Ansvaret är sparat. Den aktiva länken är oförändrad.');}
   catch(error){status(error.message);if(error.status===409){records.delete(id);invalidateList();try{await loadOne(p);}catch{}}}
   finally{busy=false;if(valid())render();}
  }
  const shirt='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m8 3-5 3 2 5 3-1v11h8V10l3 1 2-5-5-3-2 2h-2z"/><path d="M8 17h8M8 19h8" stroke="#e32648"/></svg>';
  function render(){
   if(disposed)return;const open=new Set([...cards.querySelectorAll('details.equipment-qr-player[open]')].map(c=>c.dataset.personId)),query=search.value.trim().toLocaleLowerCase('sv-SE');cards.replaceChildren();let shown=0;
   for(const p of people){if(!p.full_name.toLocaleLowerCase('sv-SE').includes(query))continue;shown++;const id=String(p.id),state=states.get(id),record=records.get(id),card=el('details');card.className='equipment-qr-player';card.dataset.personId=id;card.open=open.has(id);
    const summary=el('summary'),check=el('input');check.type='checkbox';check.checked=chosen.has(id);check.disabled=busy;check.setAttribute('aria-label','Välj '+p.full_name+' till QR-listan');check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)chosen.add(id);else chosen.delete(id);invalidateList();controls();};
    const icon=el('span');icon.className='equipment-qr-avatar';icon.innerHTML=shirt;const text=el('span');text.className='equipment-qr-person';text.append(el('strong',p.full_name));
    const info=el('small',!state?'Hämtar QR-status…':state.mode==='off'?(state.revision?'Avstängt':'Ingen QR skapad'):((state.recoverable?'Aktiv QR':'Aktiv länk · QR behöver förnyas en gång')+' · '+(state.mode==='parent'?'Förälder':'Spelare')));if(state?.mode!=='off'&&state?.recoverable)info.className='equipment-qr-active';text.append(info);const chevron=el('span','⌄');chevron.className='equipment-qr-chevron';summary.append(check,icon,text,chevron);card.append(summary);
    const body=el('div');body.className='equipment-qr-player-body';const preview=el('div');preview.className='equipment-qr-preview';
    if(record){try{preview.append(qrImage(record.url));}catch(error){preview.append(el('p',error.message));}}
    else preview.append(el('p',loading.has(id)?'Hämtar QR…':!state?'Hämtar status…':state.mode==='off'?'Aktivera en personlig QR-kod.':'En äldre aktiv länk kan importeras från sparad QR-lista eller förnyas en gång.'));
    const actions=el('div');actions.className='equipment-qr-actions';
    const renew=el('button',state?.mode==='off'?'Skapa QR':'Förnya QR');renew.type='button';renew.className='nsk-action nsk-action--save';renew.disabled=busy||!state;renew.onclick=()=>void mutate(p,state.mode==='off'?'parent':state.mode,'renew');actions.append(renew);
    if(record){const shareButton=el('button','Dela länk');shareButton.type='button';shareButton.disabled=busy;shareButton.onclick=()=>void share(p,record,body);const visit=el('a','Öppna slipningssidan');visit.href=record.url;visit.target='_blank';visit.rel='noopener noreferrer';actions.append(shareButton,visit);}
    const grid=el('div');grid.className='equipment-qr-grid';grid.append(preview,actions);body.append(grid);
    const manage=el('details');manage.className='equipment-qr-manage';manage.append(el('summary','Ändra ansvar'));
    const modeLabel=el('label','Ansvarig'),mode=el('select');for(const [value,label] of [['parent','Förälder'],['player','Spelare'],['off','Avstängt']])mode.append(new Option(label,value));mode.value=state?.mode||'off';mode.disabled=busy||!state;modeLabel.append(mode);
    const save=el('button','Spara ansvar');save.type='button';save.disabled=busy||!state;save.onclick=()=>void mutate(p,mode.value,'mode');manage.append(modeLabel,save);body.append(manage);card.append(body);
    card.addEventListener('toggle',event=>{if(event.target===card&&card.open&&!records.has(id))void reveal(p);});cards.append(card);
   }
   if(!shown)cards.append(el('p','Inga spelare matchar namnet.'));controls();
  }
  async function parallel(items,run){let cursor=0;await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(cursor<items.length){const item=items[cursor++];await run(item);}}));}
  create.onclick=async()=>{
   if(busy||metaBusy||!valid())return;busy=true;invalidateList();render();const ready=[],missing=[];let finished=0;
   const selected=people.filter(p=>!chosen.size||chosen.has(String(p.id)));
   await parallel(selected,async p=>{try{const data=await loadOne(p);if(data.mode!=='off'&&data.token)ready.push(recordFor(p,data));else missing.push(p.full_name);}catch(error){missing.push(p.full_name+': '+error.message);}finally{finished++;status('Hämtar aktuell QR-lista: '+finished+' av '+selected.length+'…');}});
   if(!valid())return;busy=false;listRecords=ready.sort((a,b)=>a.name.localeCompare(b.name,'sv-SE'));render();status(listRecords.length+' aktuella QR-koder klara.'+(missing.length?' Saknar utskrivbar QR: '+missing.join(', ')+'.':' Inga länkar har förnyats.'));
  };
  print.onclick=()=>{if(!valid()||busy||!listRecords.length)return;try{const sheet=el('div');sheet.className='qr-print-sheet';for(const r of listRecords){const card=el('section');card.className='qr-print-card';card.append(el('h2',r.name),qrImage(r.url,190),el('p','NSK · Personlig slipningssida'));sheet.append(card);}openPrintPreview(sheet);}catch(error){status(error.message);}};
  selectAll.onclick=()=>{if(chosen.size===people.length)chosen.clear();else people.forEach(p=>chosen.add(String(p.id)));invalidateList();render();};search.oninput=render;
  const files=el('details');files.className='equipment-qr-files';files.append(el('summary','Sparade QR-listfiler'));const importLabel=el('label','Importera tidigare QR-lista'),input=el('input');input.type='file';input.accept='.json,application/json';importLabel.append(input);files.append(importLabel,el('p','Endast länkar som fortfarande är aktiva importeras. Förvara filerna privat.'));root.append(files);
  input.onchange=async()=>{
   const file=input.files[0];if(!file||busy||!valid())return;busy=true;render();
   try{if(file.size>2*1024*1024)throw Error('QR-filen är för stor.');const data=JSON.parse(await file.text());if(data.format!=='nsk-qr-list'||data.version!==1||String(data.team)!==String(team)||!Array.isArray(data.records)||data.records.length>500)throw Error('Välj en QR-lista för detta lag.');
    const seen=new Set(),items=data.records.map(r=>{const p=people.find(p=>String(p.id)===String(r.personId)),url=new URL(r.url);if(!p||seen.has(String(p.id))||!['https://nsk18.pages.dev/slipning/','https://zprcsv92cy-cmyk.github.io/NSK-2026/slipning/'].includes(url.origin+url.pathname)||url.search||url.username||url.password||!/^#nyckel=[a-f0-9]{64}$/.test(url.hash))throw Error('QR-filen innehåller ogiltiga uppgifter.');seen.add(String(p.id));return {p,token:url.hash.slice(8)};});
    let imported=0;const failed=[];await parallel(items,async({p,token:candidate})=>{try{const current=await loadOne(p);if(current.token===candidate){imported++;return;}const saved=await request(String(p.id),{action:'restore',token:candidate,revision:current.revision});accept(p,saved);imported++;}catch(error){failed.push(p.full_name+': '+error.message);}});invalidateList();status(imported+' aktiva länkar importerade utan förnyelse.'+(failed.length?' Avvisade: '+failed.join('; '):''));
   }catch(error){status(error.message);}finally{busy=false;input.value='';if(valid())render();}
  };
  const onFocus=()=>{if(!document.getElementById('equipmentPaneLinks').hidden)void metadata();},tab=document.getElementById('equipmentTabLinks');tab.addEventListener('click',onFocus);window.addEventListener('focus',onFocus);
  const interval=setInterval(()=>{if(!document.hidden&&window.NSKShellActive!==false&&!document.getElementById('equipmentPaneLinks').hidden)void metadata();},30000);
  render();if(!document.getElementById('equipmentPaneLinks').hidden)void metadata(true);
  return ()=>{disposed=true;records.clear();states.clear();listRecords=[];clearInterval(interval);tab.removeEventListener('click',onFocus);window.removeEventListener('focus',onFocus);root.replaceChildren();};
 }
 const style=el('style');style.textContent=`#equipmentQrBulk{border:0!important;padding:0!important;margin:0!important}#equipmentQrBulk h2{font-size:1rem;margin:0 0 12px}#equipmentQrBulk #qrPlayers{max-height:none;overflow:visible}.equipment-qr-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.equipment-qr-toolbar button{margin:0!important;min-height:44px}.equipment-qr-player{margin:8px 0;border:1px solid #354e62;border-radius:12px;background:linear-gradient(135deg,#172735,#0d1a25);overflow:hidden}.equipment-qr-player>summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;padding:10px;min-height:64px;box-sizing:border-box}.equipment-qr-player>summary::-webkit-details-marker{display:none}.equipment-qr-player>summary input{width:22px;height:22px;flex:none}.equipment-qr-avatar{width:34px;height:40px;display:grid;place-items:center;flex:none;color:#c5d4e1}.equipment-qr-avatar svg{width:32px;height:36px}.equipment-qr-person{min-width:0;flex:1}.equipment-qr-person strong{display:block;font-size:.95rem;overflow-wrap:anywhere}.equipment-qr-person small{display:block;font-size:.75rem;color:#b8c8d7;margin-top:5px;line-height:1.35}.equipment-qr-person .equipment-qr-active{color:#85dcb1}.equipment-qr-chevron{color:#b8c8d7;font-size:22px}.equipment-qr-player[open]>.equipment-qr-chevron{transform:rotate(180deg)}.equipment-qr-player-body{padding:12px;border-top:1px solid #354e62}.equipment-qr-grid{display:grid;grid-template-columns:112px minmax(0,1fr);gap:12px;align-items:center}.equipment-qr-preview img{display:block;width:112px;height:auto;padding:6px;background:white;border-radius:8px;box-sizing:border-box;image-rendering:pixelated}.equipment-qr-preview p{font-size:.8rem;line-height:1.4;color:#b8c8d7}.equipment-qr-actions{display:grid;gap:8px;min-width:0}.equipment-qr-actions button{margin:0!important;min-height:44px;width:100%;font-size:.85rem}.equipment-qr-actions a{font-size:.75rem;min-height:36px;display:flex;align-items:center;justify-content:center;color:#d5e4f1;text-align:center}.equipment-qr-manage{border-top:1px solid #354e62;margin-top:12px;padding-top:5px}.equipment-qr-manage>summary,.equipment-qr-files>summary{font-size:.8rem;min-height:38px;padding:8px 0;cursor:pointer}.equipment-qr-manage label{display:grid;gap:5px;margin:8px 0;font-size:.8rem}.equipment-qr-manage button{min-height:44px}.equipment-qr-files{margin-top:16px;border-top:1px solid #354e62}.equipment-qr-files label{display:grid;gap:8px;font-size:.85rem}.equipment-qr-files p{font-size:.8rem;color:#b8c8d7}.equipment-qr-player-body [data-private-link]{width:100%;box-sizing:border-box;margin-top:10px}@media print{.sharpening-link-manager{display:none!important}}`;document.head.append(style);
 window.SharpeningLinks={allowed,bulk};
})();
