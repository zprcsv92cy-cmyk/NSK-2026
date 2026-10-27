// Personal links are displayed once, in memory only. They are never included in view snapshots.
(() => {
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const base=()=>String(window.APP_CONFIG?.API_URL||'https://nsk-api.peter-hasselberg.workers.dev').replace(/\/$/,'');
 const allowed=()=>{const s=window.Auth?.getSession(),team=window.Auth?.activeTeam();return s?.is_primary_admin===true||!!s?.memberships?.some(m=>(m.team_id===team||m.team_name===team)&&m.role==='equipment');};
 function mount(root,{team,personId}){
  let disposed=false,busy=false,state=null;const initialToken=Auth.getToken(),initialTeam=Auth.activeTeam();root.replaceChildren();
  const description=el('p','Välj ansvarig. När en länk skapas eller ersätts slutar den tidigare länken fungera. Appkonto behövs inte.');description.className='small';
  const label=el('label','Ansvar för slipningsönskemål'),select=el('select');label.className='sharpening-link-label';for(const [value,text] of [['parent','Förälder'],['player','Spelare'],['off','Avstängd']])select.append(new Option(text,value));label.append(select);
  const save=el('button','Spara ansvar och skapa länk');save.type='button';const reload=el('button','Läs om');reload.type='button';const actions=el('div');actions.className='sharpening-link-actions';actions.append(save,reload);
  const status=el('p','Kontrollerar behörighet…');status.className='small';status.setAttribute('role','status');status.setAttribute('aria-live','polite');const result=el('div');result.className='sharpening-link-result';root.append(description,label,actions,status,result);
  function controls(){select.disabled=busy||!state;save.disabled=busy||!state||(state.mode==='off'&&select.value==='off');reload.disabled=busy;save.textContent=select.value==='off'?'Stäng av länken':state?.mode!=='off'?'Spara och ersätt länken':'Skapa personlig länk';}
  async function request(payload){
   if(!allowed()||initialToken!==Auth.getToken()||initialTeam!==Auth.activeTeam())throw Error('Åtkomst nekad. Läs om sidan.');
   const r=await fetch(base()+'/api/sharpening/link?team_id='+encodeURIComponent(team)+'&person_id='+encodeURIComponent(personId),{method:payload?'PUT':'GET',headers:{Authorization:'Bearer '+initialToken,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,cache:'no-store',credentials:'omit'}),data=await r.json().catch(()=>({}));
   if(initialToken!==Auth.getToken()||initialTeam!==Auth.activeTeam())throw Error('Inloggningen har ändrats.');
   if(!r.ok||!data.ok)throw Object.assign(Error(data.error||'Länken kunde inte hanteras.'),{status:r.status});return data;
  }
  function showLink(token){
   result.replaceChildren();if(!/^[a-f0-9]{64}$/.test(token))throw Error('Ogiltig länk');const url=new URL('../slipning/',location.href);url.hash='nyckel='+token;
   const hint=el('p','Kopiera eller dela länken nu. Den visas bara här efter att den skapats. Den som har länken kan önska slipning för denna spelare.');hint.className='small';
   const field=el('input');field.readOnly=true;field.value=url.href;field.setAttribute('aria-label','Personlig slipningslänk');field.setAttribute('autocomplete','off');
   const copy=el('button','Kopiera länk');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(field.value);if(!disposed)status.textContent='Länken är kopierad.';}catch{field.focus();field.select();status.textContent=document.execCommand('copy')?'Länken är kopierad.':'Markera och kopiera länken i fältet.';}};
   const open=el('a','Öppna slipningssidan');open.href=url.href;open.target='_blank';open.rel='noopener noreferrer';const buttons=el('div');buttons.className='sharpening-link-actions';buttons.append(copy,open);
   if(navigator.share){const share=el('button','Dela länk');share.type='button';share.onclick=async()=>{try{await navigator.share({title:'Personlig slipningssida – NSK',url:field.value});}catch(error){if(error.name!=='AbortError')status.textContent='Kopiera länken för att dela den.';}};buttons.append(share);}
   result.append(hint,field,buttons);
   if(window.qrcode){const qr=qrcode(0,'M');qr.addData(url.href);qr.make();const image=el('img');image.alt='QR-kod till den personliga slipningssidan';image.src=qr.createDataURL(5,4);image.width=224;image.height=224;image.className='sharpening-link-qr';result.append(image);}
  }
  async function load(){busy=true;result.replaceChildren();controls();try{const data=await request();if(disposed)return;state=data;select.value=data.mode;status.textContent=data.mode==='off'?'Ingen aktiv länk. Välj Förälder eller Spelare för att skapa en.':'Aktivt ansvar: '+(data.mode==='parent'?'Förälder':'Spelare')+'. Befintlig länk visas inte igen. Skapa en ny om den saknas.';}catch(error){if(!disposed){state=null;status.textContent=error.message;}}finally{if(!disposed){busy=false;controls();}}}
  select.onchange=controls;reload.onclick=()=>void load();save.onclick=async()=>{
   if(busy||!state)return;const mode=select.value;if(state.mode!=='off'&&!confirm(mode==='off'?'Stäng av den personliga slipningslänken?':'Ersätt länken? Den gamla länken slutar fungera, men pågående slipönskemål ligger kvar.'))return;
   busy=true;controls();result.replaceChildren();status.textContent='Sparar…';
   try{const data=await request({mode,revision:state.revision});if(disposed)return;state=data;status.textContent=mode==='off'?'Länken är avstängd.':'Ny länk skapad för '+(mode==='parent'?'förälder':'spelare')+'.';if(data.token)showLink(data.token);}
   catch(error){if(!disposed){status.textContent=error.message;if(error.status===409||error.status===401||error.status===403)state=null;}}
   finally{if(!disposed){busy=false;controls();}}
  };void load();return ()=>{disposed=true;state=null;root.replaceChildren();};
 }
 function openPrintPreview(sheet){
  const preview=window.open('','_blank');if(!preview)throw Error('Utskriftsvyn kunde inte öppnas. Tillåt popupfönster och tryck Skriv ut igen.');
  const doc=preview.document;doc.open();doc.write('<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NSK – QR-lista</title><style>body{margin:0;padding:20px;background:#eef1f4;color:#111;font:16px Arial,sans-serif}.toolbar{max-width:820px;margin:0 auto 20px}.toolbar h1{font-size:22px}.toolbar button{min-height:48px;padding:10px 16px;margin:0 8px 8px 0;font:inherit;border-radius:8px;border:1px solid #777;background:white;color:#111}.qr-print-sheet{display:grid;grid-template-columns:1fr 1fr;gap:10mm;max-width:186mm;margin:auto;background:white}.qr-print-card{break-inside:avoid;text-align:center;border:1px dashed #aaa;padding:8mm;min-width:0}.qr-print-card h2{font-size:15pt;overflow-wrap:anywhere}.qr-print-card img{display:block;width:50mm;height:50mm;max-width:100%;margin:4mm auto;image-rendering:pixelated}.qr-print-card p{font-size:10pt}@media screen and (max-width:600px){.qr-print-sheet{grid-template-columns:1fr;gap:16px}}@media print{@page{size:A4;margin:12mm}body{padding:0;background:white}.toolbar{display:none}.qr-print-sheet{display:grid;grid-template-columns:1fr 1fr;max-width:none}}</style></head><body><header class="toolbar"><h1>QR-lista</h1><p>Tryck på Skriv ut. På iPhone kan du också spara utskriften som PDF via delningsknappen i utskriftsvyn.</p><button id="printQr" type="button">Skriv ut / Spara PDF</button><button id="closeQr" type="button">Stäng</button><p id="printReady" role="status">Förbereder QR-koder…</p></header></body></html>');doc.close();
  doc.body.append(doc.importNode(sheet,true));const button=doc.getElementById('printQr');button.disabled=true;button.addEventListener('click',()=>{preview.focus();preview.print();});doc.getElementById('closeQr').addEventListener('click',()=>preview.close());
  const images=[...doc.images];Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}))).then(()=>{if(preview.closed)return;button.disabled=false;doc.getElementById('printReady').textContent='QR-listan är klar för utskrift.';});
  preview.opener=null;preview.focus();return preview;
 }

 let bulkDispose=null;
 function bulk(root,{team,people}){
  bulkDispose?.();
  let disposed=false,busy=false,records=[],chosen=new Set(),modes=new Map();
  const token=Auth.getToken(),activeTeam=Auth.activeTeam(),$=id=>root.querySelector('#'+id);
  const valid=()=>!disposed&&allowed()&&Auth.getToken()===token&&Auth.activeTeam()===activeTeam;
  const status=message=>{$('qrBulkStatus').textContent=message;};
  const old=$('qrPlayers');old.replaceChildren();$('qrPrintAgain').hidden=true;
  root.querySelector('.qr-file-actions')?.remove();
  const files=el('div');files.className='qr-file-actions';
  const saveFile=el('button','Spara aktuell QR-lista som fil');saveFile.type='button';saveFile.hidden=true;
  const restoreLabel=el('label','Öppna tidigare sparad QR-lista'),restoreFile=el('input');
  restoreFile.type='file';restoreFile.accept='.json,application/json';restoreLabel.append(restoreFile);
  files.append(saveFile,restoreLabel,el('p','QR-länkar lagras inte i klartext på servern. Spara filen säkert för att visa samma QR-koder vid nästa besök.'));root.append(files);
  async function checkLink(record){
   const u=new URL(record.url),key=u.hash.slice('#nyckel='.length);
   if(!/^[a-f0-9]{64}$/.test(key))return false;
   try{const response=await fetch(base()+'/api/sharpening/public',{headers:{Authorization:'Sharpening '+key},cache:'no-store'});return response.ok;}
   catch{return false;}
  }
  const getRecord=id=>records.find(r=>String(r.personId)===String(id));
  function qrImage(url,size=112){if(!window.qrcode)return el('span','QR-bibliotek saknas');const qr=qrcode(0,'M');qr.addData(url);qr.make();const img=el('img');img.src=qr.createDataURL(5,4);img.alt='Aktuell QR-kod';img.width=size;img.height=size;img.style.cssText='background:white;padding:6px;border-radius:8px;max-width:100%;height:auto';return img;}
  function render(){
   const query=$('qrNameSearch').value.trim().toLocaleLowerCase('sv-SE');
   old.replaceChildren();
   for(const p of people.filter(p=>p.full_name.toLocaleLowerCase('sv-SE').includes(query))){
    const id=String(p.id),record=getRecord(id),card=el('details');card.className='equipment-qr-player';
    const summary=el('summary'),check=el('input');check.type='checkbox';check.checked=chosen.has(id);check.disabled=busy;check.setAttribute('aria-label','Välj '+p.full_name);check.onclick=e=>e.stopPropagation();
    check.onchange=()=>{if(check.checked)chosen.add(id);else chosen.delete(id);};
    const name=el('strong',p.full_name),state=el('small',record?'Aktuell QR sparad':'QR behöver hämtas eller förnyas');
    const heading=el('span');heading.append(name,state);summary.append(check,heading);card.append(summary);
    const body=el('div');body.className='equipment-qr-player-body';
    if(record){body.append(qrImage(record.url));const actions=el('div');actions.className='equipment-qr-actions';
     const share=el('button','Dela');share.type='button';share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:'Slipningslänk – '+p.full_name,url:record.url});else if(navigator.clipboard){await navigator.clipboard.writeText(record.url);status('Länken kopierad för '+p.full_name+'.');}else status('Öppna den sparade QR-listfilen för att dela länken.');}catch(error){if(error.name!=='AbortError')status('Delning misslyckades: '+error.message);}};
     actions.append(share);body.append(actions);
    }else body.append(el('p','En tidigare skapad QR-kod kan inte läsas tillbaka från servern. Öppna en sparad QR-listfil eller förnya länken.'));
    const mode=el('select');for(const [v,label] of [['parent','Förälder'],['player','Spelare']])mode.append(new Option(label,v));mode.value=modes.get(id)||'parent';mode.onchange=()=>modes.set(id,mode.value);
    const renew=el('button','Förnya QR');renew.type='button';renew.disabled=busy;
    renew.onclick=async()=>{if(!valid()){status('Logga in igen och ladda om sidan.');return;}if(!confirm('Förnya QR för '+p.full_name+'? Den gamla länken slutar fungera.'))return;
     busy=true;status('Förnyar QR för '+p.full_name+'…');render();
     try{const rec=await renewOne(p,mode.value);records=records.filter(r=>String(r.personId)!==id);records.push(rec);status('Ny QR skapad för '+p.full_name+'. Spara QR-listfilen så att koden finns kvar.');}
     catch(error){status('Kunde inte förnya QR för '+p.full_name+': '+error.message);}
     finally{busy=false;render();}
    };
    const controls=el('div');controls.className='equipment-qr-actions';controls.append(mode,renew);body.append(controls);card.append(body);old.append(card);
   }
   saveFile.hidden=!records.length;$('qrPrintAgain').hidden=!records.length;
   $('qrCreateList').disabled=busy;
  }
  async function renewOne(p,mode){
   if(!valid())throw Error('Inloggningen har ändrats.');
   const url=base()+'/api/sharpening/link?team_id='+encodeURIComponent(team)+'&person_id='+encodeURIComponent(p.id);
   const headers={Authorization:'Bearer '+token};
   const currentResponse=await fetch(url,{headers,cache:'no-store'}),current=await currentResponse.json().catch(()=>({}));
   if(!currentResponse.ok||!current.ok)throw Error(current.error||'Kunde inte hämta länkstatus ('+currentResponse.status+').');
   const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({mode,revision:current.revision}),cache:'no-store'}),data=await response.json().catch(()=>({}));
   if(!response.ok||!data.ok||!data.token)throw Error(data.error||'Kunde inte skapa QR ('+response.status+').');
   const link=new URL('../slipning/',location.href);link.hash='nyckel='+data.token;
   return {name:p.full_name,url:link.href,personId:String(p.id)};
  }
  const print=()=>{if(!valid()){status('Logga in igen.');return;}const selected=records.filter(r=>chosen.size===0||chosen.has(String(r.personId)));if(!selected.length){status('Inga aktuella QR-koder finns för de valda spelarna.');return;}
   const sheet=el('div');sheet.className='qr-print-sheet';
   for(const r of selected){const card=el('section');card.className='qr-print-card';card.append(el('h2',r.name),qrImage(r.url,190),el('p','NSK · Personlig slipningssida'));sheet.append(card);}
   try{openPrintPreview(sheet);status('Utskriftsvyn öppnades med '+selected.length+' befintliga QR-koder. Inga länkar har ersatts.');}catch(error){status(error.message);}
  };
  saveFile.onclick=()=>{if(!valid()||!records.length)return;const blob=new Blob([JSON.stringify({format:'nsk-qr-list',version:1,team:String(team),records})],{type:'application/json'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download='nsk-qr-lista.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
  restoreFile.onchange=async()=>{try{const file=restoreFile.files?.[0];if(!file)return;if(!valid())throw Error('Logga in igen.');if(file.size>2*1024*1024)throw Error('Filen är för stor.');
   const data=JSON.parse(await file.text());if(!valid())throw Error('Inloggningen har ändrats.');
   if(data.format!=='nsk-qr-list'||data.version!==1||String(data.team)!==String(team)||!Array.isArray(data.records)||!data.records.length||data.records.length>500)throw Error('Fel QR-lista eller lag.');
   for(const r of data.records){const u=new URL(r.url);if(typeof r.name!=='string'||r.name.length>150||!people.some(p=>String(p.id)===String(r.personId))||!['https://nsk18.pages.dev/slipning/','https://zprcsv92cy-cmyk.github.io/NSK-2026/slipning/'].includes(u.origin+u.pathname)||u.search||u.username||u.password||!/^#nyckel=[a-f0-9]{64}$/.test(u.hash))throw Error('QR-filen innehåller ogiltiga uppgifter.');}
   const verified=[];for(const r of data.records){if(!valid())throw Error('Inloggningen har ändrats.');if(await checkLink(r))verified.push({name:r.name,url:r.url,personId:String(r.personId)});}
   records=verified;status(verified.length+' giltiga QR-koder hämtades från filen.'+(verified.length!==data.records.length?' '+(data.records.length-verified.length)+' gamla eller otillgängliga länkar utelämnades.':'')+' Kontrollera att rätt person får varje länk.');render();
  }catch(error){status(error.message);}finally{restoreFile.value='';}};
  $('qrNameSearch').oninput=render;$('qrPrintAgain').onclick=print;
  $('qrCreateList').textContent='Skriv ut aktuell QR-lista';$('qrCreateList').onclick=print;
  const renewSelected=el('button','Förnya QR för valda');renewSelected.type='button';$('qrCreateList').before(renewSelected);
  renewSelected.onclick=async()=>{if(busy)return;if(!chosen.size){status('Markera minst en spelare först.');return;}if(!valid()){status('Logga in igen.');return;}
   if(!confirm('Förnya QR för '+chosen.size+' valda spelare? Tidigare länkar slutar fungera.'))return;
   busy=true;render();const failures=[];
   for(const p of people.filter(p=>chosen.has(String(p.id)))){if(!valid())break;status('Förnyar QR: '+p.full_name+'…');try{const rec=await renewOne(p,modes.get(String(p.id))||$('qrMode').value);records=records.filter(r=>String(r.personId)!==String(p.id));records.push(rec);}catch(error){failures.push(p.full_name+': '+error.message);}}
   busy=false;render();status(records.length+' QR-koder finns i listan.'+(failures.length?' Fel: '+failures.join('; '):' Spara filen innan du lämnar sidan.'));
  };
  render();bulkDispose=()=>{disposed=true;records=[];renewSelected.remove();};
 }
 window.addEventListener('afterprint',()=>{document.body.classList.remove('qr-printing');document.querySelector('.qr-print-sheet')?.remove();});
 const style=el('style');style.textContent='.sharpening-link-label{display:grid;gap:7px}.sharpening-link-label select,.sharpening-link-result input{box-sizing:border-box;width:100%;min-width:0}.sharpening-link-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}.sharpening-link-actions button,.sharpening-link-actions a{min-height:44px}.sharpening-link-actions a{display:inline-flex;align-items:center}.sharpening-link-qr{display:block;max-width:100%;width:224px;height:auto;background:white;padding:8px;margin:14px auto;image-rendering:pixelated}.sharpening-link-result .small{line-height:1.5}@media print{.sharpening-link-manager{display:none!important}}';document.head.append(style);
 window.SharpeningLinks={allowed,mount,bulk};
})();
