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
 const style=el('style');style.textContent='.sharpening-link-label{display:grid;gap:7px}.sharpening-link-label select,.sharpening-link-result input{box-sizing:border-box;width:100%;min-width:0}.sharpening-link-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:12px 0}.sharpening-link-actions button,.sharpening-link-actions a{min-height:44px}.sharpening-link-actions a{display:inline-flex;align-items:center}.sharpening-link-qr{display:block;max-width:100%;width:224px;height:auto;background:white;padding:8px;margin:14px auto;image-rendering:pixelated}.sharpening-link-result .small{line-height:1.5}@media print{.sharpening-link-manager{display:none!important}}';document.head.append(style);
 window.SharpeningLinks={allowed,mount};
})();
