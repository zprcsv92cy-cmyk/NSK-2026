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
  bulkDispose?.();let disposed=false,busy=false,records=[],chosen=new Set();const token=Auth.getToken(),activeTeam=Auth.activeTeam();
  const $=id=>root.querySelector('#'+id);$('qrPlayers').replaceChildren();$('qrPrintAgain').hidden=true;
  const render=()=>{const query=$('qrNameSearch').value.trim().toLocaleLowerCase('sv-SE');$('qrPlayers').replaceChildren();for(const p of people.filter(p=>p.full_name.toLocaleLowerCase('sv-SE').includes(query))){const label=el('label'),check=el('input');check.type='checkbox';check.checked=chosen.has(String(p.id));check.disabled=busy;check.onchange=()=>{if(check.checked)chosen.add(String(p.id));else chosen.delete(String(p.id));};label.append(check,document.createTextNode(p.full_name));$('qrPlayers').append(label);}};
  const print=()=>{if(!allowed()||Auth.getToken()!==token||Auth.activeTeam()!==activeTeam||!records.length)return;document.querySelector('.qr-print-sheet')?.remove();const sheet=el('div');sheet.className='qr-print-sheet';for(const r of records){const card=el('section');card.className='qr-print-card';const qr=qrcode(0,'M');qr.addData(r.url);qr.make();const img=el('img');img.src=qr.createDataURL(5,4);img.alt='QR-kod för '+r.name;card.append(el('h2',r.name),img,el('p','NSK · Personlig slipningssida'));sheet.append(card);}try{openPrintPreview(sheet);$('qrBulkStatus').textContent='QR-listan öppnades i en egen utskriftsvy. Tryck Skriv ut där.';}catch(error){$('qrBulkStatus').textContent=error.message;}};
  $('qrNameSearch').oninput=render;$('qrPrintAgain').onclick=print;
  $('qrCreateList').onclick=async()=>{
   if(busy||!chosen.size)return;if(!confirm('Skapa nya länkar för '+chosen.size+' valda spelare? Deras tidigare länkar slutar fungera.'))return;
   const mode=$('qrMode').value;busy=true;$('qrMode').disabled=true;records=[];$('qrPrintAgain').hidden=true;$('qrCreateList').disabled=true;render();const failures=[];
   for(const p of people.filter(p=>chosen.has(String(p.id)))){if(disposed||!allowed()||Auth.getToken()!==token||Auth.activeTeam()!==activeTeam)break;
    try{const url=base()+'/api/sharpening/link?team_id='+encodeURIComponent(team)+'&person_id='+encodeURIComponent(p.id),headers={Authorization:'Bearer '+token},currentResponse=await fetch(url,{headers,cache:'no-store'}),current=await currentResponse.json();if(!currentResponse.ok||!current.ok)throw Error();const response=await fetch(url,{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({mode,revision:current.revision}),cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok||!data.token)throw Error();const link=new URL('../slipning/',location.href);link.hash='nyckel='+data.token;records.push({name:p.full_name,url:link.href});}
    catch{failures.push(p.full_name);}if(!disposed)$('qrBulkStatus').textContent=records.length+' länkar klara…';
   }
   if(disposed)return;busy=false;$('qrMode').disabled=false;render();$('qrCreateList').disabled=false;$('qrPrintAgain').hidden=!records.length;$('qrBulkStatus').textContent=records.length+' QR-koder klara.'+(failures.length?' Kunde inte skapa för: '+failures.join(', ')+'. Skriv ut de klara innan du försöker igen.':' Välj Skriv ut QR-listan.');
  };render();bulkDispose=()=>{disposed=true;records=[];document.querySelector('.qr-print-sheet')?.remove();document.body.classList.remove('qr-printing');};
 }
 window.addEventListener('afterprint',()=>{document.body.classList.remove('qr-printing');document.querySelector('.qr-print-sheet')?.remove();});
 const style=el('style');style.textContent='.sharpening-link-label{display:grid;gap:7px}.sharpening-link-label select,.sharpening-link-result input{box-sizing:border-box;width:100%;min-width:0}.sharpening-link-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}.sharpening-link-actions button,.sharpening-link-actions a{min-height:44px}.sharpening-link-actions a{display:inline-flex;align-items:center}.sharpening-link-qr{display:block;max-width:100%;width:224px;height:auto;background:white;padding:8px;margin:14px auto;image-rendering:pixelated}.sharpening-link-result .small{line-height:1.5}@media print{.sharpening-link-manager{display:none!important}}';document.head.append(style);
 window.SharpeningLinks={allowed,mount,bulk};
})();
