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

  // Curated source links and original NSK summaries; no Hockeyakademin images/PDFs are copied.
  const academyItems = [
    {
      "title": "Skridskocirkeln",
      "category": "Skridskoteknik",
      "age": "U9–U12",
      "description": "Skridskoåkning och vändningar runt tekningscirkeln. Träna balans, framåt- och baklängesåkning i små grupper.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/cirkelklockan"
    },
    {
      "title": "Passnings virr-varr",
      "category": "Passningar",
      "age": "U9–U12",
      "description": "Små grupper passar pucken under fri rörelse på isen. Fokus på kommunikation, uppsikt och mottagning.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/passnings-virr-varr"
    },
    {
      "title": "Smålagsspel – ett mål",
      "category": "Smålagsspel",
      "age": "TKH/U9–U12",
      "description": "Spel på avgränsad yta där lagen arbetar mot samma mål. Anpassa antalet spelare till gruppens nivå.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/smalagsspel-ett-mal"
    },
    {
      "title": "Smålagsspel – klassiskt",
      "category": "Smålagsspel",
      "age": "TKH/U9–U12",
      "description": "Korta spel med små lag och många puckkontakter. Variera lagstorlek och hur målen står placerade.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/smalagsspel-klassiskt"
    },
    {
      "title": "1 mot 1 genom hinderbana",
      "category": "Skridskoteknik",
      "age": "TKH/U9–U12",
      "description": "Två spelare åker genom en utmanande bana och tävlar sedan om pucken. Träna skridskor, balans och spelförståelse.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/1-mot-1-2"
    },
    {
      "title": "1 mot 1 – närkampsspel",
      "category": "Spelsituationer",
      "age": "U9–U12",
      "description": "Spelare utmanar varandra med puck. Fokus på balans, klubba mot puck och positionering framför eget mål.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/1-mot-1-3"
    },
    {
      "title": "3 mot 3 – smålagsspel",
      "category": "Smålagsspel",
      "age": "U9–U12",
      "description": "Tre mot tre på begränsad isyta. Träna spelbarhet, puckvinst och snabba beslut med korta byten.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/3-mot-3-2"
    },
    {
      "title": "Färdigt ispass – fyra stationer",
      "category": "Uppvärmning",
      "age": "U9–U12",
      "description": "Ett stationspass med skridskoåkning, puckkontroll, närkampsmoment och smålagsspel. Följ originalets stationsupplägg.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/stationstraning-4-ytor"
    },
    {
      "title": "Färdigt ispass – fem stationer",
      "category": "Uppvärmning",
      "age": "U9–U12",
      "description": "Färdig stationsstruktur med puckteknik, skott och flera smålagsspel. Använd originalet för stationsritningarna.",
      "sourceUrl": "https://hockeyakademin.se/ovningar/stationstraning-5-ytor"
    }
  ];
  // Only exact, individually checked original addresses; never invent a slug from a title.
  const verifiedOriginals = {
    "Powerplay - 5 mot 2": "powerplay-5-mot-2",
    "2 mot 1": "2-mot-1-3",
    "1 mot 1 med nedlägg": "1-mot-1-8",
    "Ingångar/hemgångar - 1 mot 1 (Video)": "ingangar-hemgangar",
    "2 mot 1 - stationsträning (video)": "2-mot-1-2",
    "Skridskocirkeln (Video)": "cirkelklockan",
    "Passnings virr-varr": "passnings-virr-varr",
    "Smålagsspel - ett mål": "smalagsspel-ett-mal",
    "Smålagsspel - Klassiskt (video)": "smalagsspel-klassiskt",
    "3 mot 3": "3-mot-3-2",
    "Fjärilen (Video)": "fjarilen",
    "Åttan - med passningar (Video)": "attan-med-passningar",
    "Puckföring virr-varr": "puckforing-virr-varr",
    "Pass i cirkel": "cirkelpass",
    "Smålagsspel - små mål": "smalagsspel-sma-mal",
    "TKH - Fri lek": "tkh-fri-lek",
    "Målskytte i rörelse - quick release": "malskytte-i-rorelse-quick-release",
    "Puckföringsbana": "puckforingsbana",
    "Skridskoåkning, tekniska grunder del 1": "skridskoakning-tekniska-grunder",
    "Färdiga ispass - Stationsträning (5 ytor)": "stationstraning-5-ytor",
    "Färdiga ispass TKH – Smålagsspel": "stationstraning-smalagsspel",
    "Färdiga ispass TKH - 10 stationer": "stationstraning-10-stationer",
    "Färdiga ispass TKH - 6 stationer": "stationstraning-6-stationer",
    "Färdiga ispass TKH - 5 stationer": "stationstraning-5-stationer",
    "Smålagsspel - Med passare (Video)": null
  };
  const normalizeTitle = value=>String(value||'').toLocaleLowerCase('sv').replace(/\s+/g,' ').trim();
  const fullAcademyItems = (window.NSK_HOCKEYAKADEMIN_CATALOG||[]).map((entry,index)=>{
    const variants=window.NSK_HOCKEYAKADEMIN_CATALOG.slice(0,index).filter(x=>x.title===entry.title).length;
    let slug=verifiedOriginals[entry.title];
    if(entry.title==='Färdiga ispass - Stationsträning (4 ytor)')slug=['stationstraning-4-ytor','stationstraning-4-ytor-2','stationstraning-4-ytor-3'][variants]||null;
    const sourceUrl=slug?'https://hockeyakademin.se/ovningar/'+slug:null;
    const original=academyItems.find(x=>normalizeTitle(x.title)===normalizeTitle(entry.title.replace(/ \(Video\)$/i,'')));
    return {...entry,index,sourceUrl,hasDirectLink:!!sourceUrl,
      searchUrl:'https://www.google.com/search?q='+encodeURIComponent('site:hockeyakademin.se/ovningar/ "'+entry.title+'"'),
      description:original?.description||'Övning ur Hockeyakademins offentliga register. Öppna originalet för fullständiga instruktioner och rinkritning.'};
  });
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
    const aliases={'Skridskoteknik':['Skridskoåkning'],'Puckkontroll':['Klubbteknik'],'Passningar':['Passning och mottagning'],'Skott':['Skott och målskytte'],'Spelsituationer':['Spela spelet','Närkampsspel']};
    const matchesCategory=!cat||entry.category===cat||(aliases[cat]||[]).some(c=>entry.category.includes(c));
    const age=$('exerciseAge').value;
    const matchesAge=!age||!entry.age||entry.age.includes(age)||entry.age==='Alla';
    return matchesCategory&&matchesAge&&(!query||(entry.title+' '+entry.description+' '+entry.category+' '+(entry.age||'')).toLocaleLowerCase('sv').includes(query));
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

  function makeAcademyCard(entry){
    const card=document.createElement('article');card.className='archive-item';
    card.append(text('h3',entry.title));
    card.append(text('p',entry.category+' · '+entry.age+' · Hockeyakademin','small'));
    card.append(text('p',entry.description));
    const actions=document.createElement('div');actions.className='archive-actions';
    const link=document.createElement('a');
    link.href=entry.hasDirectLink?entry.sourceUrl:entry.searchUrl;
    link.target='_blank';link.rel='noopener noreferrer';
    link.className='archive-source-link';
    link.textContent=entry.hasDirectLink?'Visa rätt originalövning ↗':'Sök efter just denna övning ↗';
    if(!entry.hasDirectLink){
      card.append(text('p','Direktlänken är ännu inte verifierad. Sökningen använder exakt övningsnamn på Hockeyakademins webbplats och visar möjliga träffar.','small'));
    }
    actions.append(link);card.append(actions);return card;
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
    const source=$('exerciseAcademyList');source.replaceChildren();
    const selected=$('exerciseSource').value;
    if(selected!=='nsk')for(const entry of fullAcademyItems.filter(match))source.append(makeAcademyCard(entry));
    if(selected==='nsk')source.append(text('p','Visa alla källor eller välj Hockeyakademin för att se originalövningarna.'));
    if(selected==='academy'&&!fullAcademyItems.some(match))source.append(text('p','Inga övningar matchar sökningen.'));
    const list=$('exerciseList');list.replaceChildren();
    if(selected!=='academy')for(const [index,entry] of items.entries())if(match(entry))list.append(makeCard(entry,false,index));
    const container=$('exerciseUserFiles');container.replaceChildren();
    try{
      const files=(await getFiles()).sort((a,b)=>b.created-a.created);
      for(const entry of (selected==='academy'?[]:files.filter(match)))container.append(makeCard(entry,true));
      if(!files.length)container.append(text('p','Inga egna filer sparade ännu.'));
      $('exerciseStatus').textContent=(selected==='nsk'?0:fullAcademyItems.filter(match).length)+' Hockeyakademin · '+(selected==='academy'?0:items.filter(match).length)+' NSK · '+(selected==='academy'?0:files.filter(match).length)+' egna filer';
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
    $('exerciseSource').addEventListener('change',render);
    $('exerciseAge').addEventListener('change',render);
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
