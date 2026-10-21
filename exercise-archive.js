// Exercise cards are public examples; personal uploaded files stay in this browser's IndexedDB.
(() => {
  const items = [
    {
      "title": "Skridskoåkning – start, stopp och vändning",
      "category": "Skridskoteknik",
      "minutes": 12,
      "description": "Åk mellan koner med kort acceleration, kontrollerat stopp åt båda håll och en snäv vändning. Kör i små grupper så alla får många repetitioner.",
      "equipment": "Koner och klubbor",
      "coaching": "Böjda knän, balans och kontroll. Ge alla tid att utveckla tekniken."
    },
    {
      "title": "Puckbana med svängar",
      "category": "Puckkontroll",
      "minutes": 12,
      "description": "Driv puck genom en konbana. Lägg in breda och snäva svängar samt byte mellan forehand och backhand.",
      "equipment": "Puckar, klubbor och koner",
      "coaching": "Håll pucken nära bladet, våga lyfta blicken och använd båda sidorna av klubban."
    },
    {
      "title": "Passa och följ",
      "category": "Passningar",
      "minutes": 12,
      "description": "Spelarna står i två led. Passa till andra ledet och åk efter passningen. Utöka med mottagning i rörelse.",
      "equipment": "Puckar, klubbor och koner",
      "coaching": "Klubban i isen, tydlig passningsriktning och mjuk mottagning."
    },
    {
      "title": "Skott från nära håll",
      "category": "Skott",
      "minutes": 12,
      "description": "Skjut från markerade positioner nära mål. Hämta pucken och byt led. Låt barnen prova olika avslut utan press.",
      "equipment": "Puckar, klubbor och mål",
      "coaching": "Sikta, följ igenom rörelsen och se till att ingen åker framför skytten."
    },
    {
      "title": "2 mot 2 på liten yta",
      "category": "Smålagsspel",
      "minutes": 15,
      "description": "Spela två mot två på avgränsad isyta med små mål. Byt korta omgångar för hög aktivitet och många puckkontakter.",
      "equipment": "Puckar, koner, västar och småmål",
      "coaching": "Spelbarhet, samarbete, puckjakt och glädje."
    },
    {
      "title": "Målvakt – grundställning och sidledsförflyttning",
      "category": "Målvakter",
      "minutes": 12,
      "description": "Målvakten tränar grundställning och lugna sidledsförflyttningar mellan två markeringar. Avsluta med lätta, kontrollerade skott.",
      "equipment": "Mål, koner och puckar",
      "coaching": "Tryggt tempo, balans och god uppsikt över övriga spelare."
    },
    {
      "title": "Stafett på skridskor",
      "category": "Uppvärmning",
      "minutes": 10,
      "description": "Dela in i små lag som åker en kort bana och växlar genom en tydlig markering. Anpassa svårigheten för alla nivåer.",
      "equipment": "Koner",
      "coaching": "Uppmuntra laganda och kontroll; låt säkerhet gå före tävling."
    },
    {
      "title": "1 mot 1 längs sargen",
      "category": "Spelsituationer",
      "minutes": 12,
      "description": "En anfallare driver puck längs en markerad yta medan en försvarare försöker styra bort anfallaren med klubba och positionering. Ingen kroppstackling.",
      "equipment": "Puckar, klubbor och koner",
      "coaching": "Balans, klubbarbete och säker närkampsposition."
    },
    {
      "title": "Puckhämtning och vänd upp",
      "category": "Puckkontroll",
      "minutes": 12,
      "description": "Starta vid en kon, hämta en stillaliggande puck, vänd upp och spela tillbaka till en medspelare. Växla höger och vänster.",
      "equipment": "Puckar, klubbor och koner",
      "coaching": "Orientera före puckhämtning och behåll fart genom svängen."
    },
    {
      "title": "Tre passningar till avslut",
      "category": "Passningar",
      "minutes": 15,
      "description": "Tre spelare passar pucken mellan varandra under förflyttning och avslutar mot mål. Starta lugnt och korta avstånden efter behov.",
      "equipment": "Puckar, klubbor, koner och mål",
      "coaching": "Tajming, ta emot puck i rörelse och beröm samarbetet."
    }
  ];

  const $ = id=>document.getElementById(id);
  let previewUrl=null, previewPreviousFocus=null, previewEntry=null;
  const dbName='nsk_exercise_files_v1',store='files';
  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(dbName,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(store))req.result.createObjectStore(store,{keyPath:'id'});};
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
  }
  async function transact(mode,work){
    const db=await openDb();
    try{return await new Promise((resolve,reject)=>{
      const tx=db.transaction(store,mode),os=tx.objectStore(store);
      let result;const req=work(os);
      req.onsuccess=()=>{result=req.result;};
      tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });}finally{db.close();}
  }
  const getFiles=()=>transact('readonly',os=>os.getAll());
  const saveFile=record=>transact('readwrite',os=>os.put(record));
  const deleteFile=id=>transact('readwrite',os=>os.delete(id));
  function text(tag,value,className){
    const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;
  }
  function match(entry){
    const query=$('exerciseSearch').value.trim().toLocaleLowerCase('sv');
    const cat=$('exerciseCategory').value;
    return (!cat||entry.category===cat)&&(!query||(entry.title+' '+entry.description+' '+entry.category).toLocaleLowerCase('sv').includes(query));
  }

  function closePreview(){
    $('exercisePreviewModal').hidden=true;
    document.body.classList.remove('archive-preview-print');
    $('exercisePreviewImage').replaceChildren();
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    previewEntry=null;
    previewPreviousFocus?.focus?.();
  }
  function openPreview(entry,uploaded=false,index=0){
    const dialog=$('exercisePreviewModal'),host=$('exercisePreviewImage');
    if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
    previewPreviousFocus=document.activeElement;
    previewEntry={entry,uploaded,index};
    host.replaceChildren();
    $('exercisePreviewTitle').textContent=entry.title;
    $('exercisePreviewDescription').textContent=entry.description||'Ingen beskrivning angiven.';
    $('exercisePreviewInfo').textContent=uploaded?entry.category:(entry.category+' · '+entry.minutes+' minuter · Material: '+entry.equipment+' · Tränartips: '+entry.coaching);
    if(!uploaded){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('role','img');svg.setAttribute('aria-label','Rinkritning för '+entry.title);
      window.NskExerciseRink.render(svg,window.NskExerciseRink.diagram(index));
      host.append(svg);
    }else{
      const mime=String(entry.blob?.type||'');
      const isImage=mime.startsWith('image/')||/\.(svg|png|jpe?g|webp)$/i.test(entry.filename||'');
      const isPdf=mime==='application/pdf'||/\.pdf$/i.test(entry.filename||'');
      if(!isImage&&!isPdf){return;}
      previewUrl=URL.createObjectURL(entry.blob);
      if(isImage){
        const img=document.createElement('img');img.src=previewUrl;img.alt='Uppritad övning: '+entry.title;
        host.append(img);
      }else{
        const frame=document.createElement('iframe');frame.src=previewUrl;
        frame.title='Övningsfil: '+entry.title;frame.style.cssText='width:100%;height:100%;border:0;background:#fff';
        host.append(frame);
      }
    }
    dialog.hidden=false;
    $('exercisePreviewClose').focus();
  }

  function makeCard(entry,uploaded,index=0){
    const card=document.createElement('article');card.className='archive-item';
    card.append(text('h3',entry.title),text('p',entry.category+(uploaded?'':' · '+entry.minutes+' min'),'small'),text('p',entry.description));
    if(!uploaded){card.append(text('p','Material: '+entry.equipment),text('p','Tränartips: '+entry.coaching));}
    const buttons=document.createElement('div');buttons.className='archive-actions';
    if(uploaded){
      const canView=entry.blob instanceof Blob && (/^image\//.test(entry.blob.type)||entry.blob.type==='application/pdf'||/\.(svg|png|jpe?g|webp|pdf)$/i.test(entry.filename||''));
      if(canView){
        const view=document.createElement('button');view.type='button';view.textContent='Visa';
        view.addEventListener('click',()=>openPreview(entry,true,index));buttons.append(view);
      }
      const download=document.createElement('button');download.type='button';download.textContent='Hämta fil';
      download.addEventListener('click',()=>{
        const url=URL.createObjectURL(entry.blob);
        const a=document.createElement('a');a.href=url;a.download=entry.filename;a.click();
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      });
      const remove=document.createElement('button');remove.type='button';remove.textContent='Ta bort';
      remove.addEventListener('click',async()=>{if(!confirm('Ta bort filen från den här webbläsaren?'))return;await deleteFile(entry.id);await render();});
      buttons.append(download,remove);
    }else{
      const view=document.createElement('button');view.type='button';view.textContent='Visa';
      view.addEventListener('click',()=>openPreview(entry,false,index));buttons.append(view);
      const print=document.createElement('button');print.type='button';print.textContent='Skriv ut övning';
      print.addEventListener('click',()=>{openPreview(entry,false,index);document.body.classList.add('archive-preview-print');window.print();});
      buttons.append(print);
    }
    card.append(buttons);return card;
  }
  async function render(){
    const list=$('exerciseList');list.replaceChildren();
    for(const [index,entry] of items.entries())if(match(entry))list.append(makeCard(entry,false,index));
    const container=$('exerciseUserFiles');container.replaceChildren();
    try{
      const files=(await getFiles()).sort((a,b)=>b.created-a.created);
      for(const entry of files.filter(match))container.append(makeCard(entry,true));
      if(!files.length)container.append(text('p','Inga egna filer sparade ännu.'));
      $('exerciseStatus').textContent=items.filter(match).length+' färdiga övningar · '+files.filter(match).length+' egna filer';
    }catch{container.append(text('p','Filarkivet kunde inte öppnas i den här webbläsaren.'));$('exerciseStatus').textContent='De färdiga övningarna är tillgängliga.';}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    $('exercisePreviewClose').addEventListener('click',closePreview);
    $('exercisePreviewPrint').addEventListener('click',()=>{document.body.classList.add('archive-preview-print');window.print();});
    window.addEventListener('afterprint',()=>document.body.classList.remove('archive-preview-print'));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!$('exercisePreviewModal').hidden)closePreview();
      if(event.key==='Tab'&&!$('exercisePreviewModal').hidden){
        const focusables=Array.from($('exercisePreviewModal').querySelectorAll('button:not([disabled])'));
        const first=focusables[0],last=focusables[focusables.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    $('exerciseSearch').addEventListener('input',render);
    $('exerciseCategory').addEventListener('change',render);
    $('exerciseUpload').addEventListener('submit',async event=>{
      event.preventDefault();const file=$('exerciseFile').files[0];
      const allowed=/\.(pdf|doc|docx|txt|png|jpe?g|webp)$/i;
      if(!file||file.size>15*1024*1024||!allowed.test(file.name)){$('exerciseStatus').textContent='Välj en tillåten fil på högst 15 MB.';return;}
      const button=$('exerciseUpload').querySelector('button');button.disabled=true;
      try{
        const record={id:crypto.randomUUID(),title:$('exerciseTitle').value.trim(),description:$('exerciseDescription').value.trim(),category:$('exerciseUploadCategory').value,filename:file.name,blob:file,created:Date.now()};
        if(!record.title)throw Error('Namn saknas');
        await saveFile(record);
        $('exerciseUpload').reset();await render();$('exerciseStatus').textContent='Filen har sparats lokalt i den här webbläsaren.';
      }catch(error){$('exerciseStatus').textContent='Kunde inte spara filen: '+(error.message||'okänt fel');}finally{button.disabled=false;}
    });
    render();
  });
})();
