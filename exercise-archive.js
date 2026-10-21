// Exercise cards are public examples; personal uploaded files stay in this browser's IndexedDB.
(() => {
  const items = [
    {title:'Fånga svansen',category:'Uppvärmning',minutes:10,description:'Alla spelare har en väst som svans. Försök samla svansar medan du skyddar din egen.',equipment:'Västar och koner',coaching:'Rörelseglädje, blick upp och snabba riktningsförändringar.'},
    {title:'Dribblingsbana',category:'Teknik',minutes:12,description:'Bygg en bana med slalom, vändning och avslut. Byt fot mellan omgångarna.',equipment:'En boll per spelare, koner, två småmål',coaching:'Många bollkontakter och kontroll före fart.'},
    {title:'Passning i triangel',category:'Passningar',minutes:12,description:'Tre spelare passar i triangel och följer sin passning. Byt riktning efter några minuter.',equipment:'Bollar och koner',coaching:'Mottagning med första touch och visa vart passningen ska.'},
    {title:'3 mot 3 med småmål',category:'Spelövningar',minutes:18,description:'Spela 3 mot 3 på små planer. Korta matcher och många byten.',equipment:'Bollar, koner och fyra småmål',coaching:'Hitta fria ytor, samarbeta och låt alla få bollen.'},
    {title:'Målvakt – greppa och rulla',category:'Målvakter',minutes:12,description:'Tränaren rullar och kastar mjuka bollar i olika höjder. Målvakten fångar och startar spelet med utrullning.',equipment:'Bollar och mål',coaching:'Grundställning, trygg teknik och tydlig kommunikation.'},
    {title:'Stegar och riktningsbyte',category:'Koordination',minutes:10,description:'Öva snabba fötter genom stege eller konrader. Avsluta med en kort acceleration.',equipment:'Koordinationsstege eller koner',coaching:'Balans, variation och kvalitet framför fart.'},
    {title:'1 mot 1 till mål',category:'Teknik',minutes:15,description:'En anfallare försöker passera sin försvarare och avsluta mot ett litet mål.',equipment:'Bollar, koner och småmål',coaching:'Uppmuntra finter och direkt återerövring.'},
    {title:'Fyra hörn – pass och löp',category:'Passningar',minutes:12,description:'Fyra stationer bildar en kvadrat. Passa till nästa hörn och spring efter bollen.',equipment:'Koner och bollar',coaching:'Titta före passningen och kommunicera med mottagaren.'}
  ];
  const $ = id=>document.getElementById(id);
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
  function makeCard(entry,uploaded){
    const card=document.createElement('article');card.className='archive-item';
    card.append(text('h3',entry.title),text('p',entry.category+(uploaded?'':' · '+entry.minutes+' min'),'small'),text('p',entry.description));
    if(!uploaded){card.append(text('p','Material: '+entry.equipment),text('p','Tränartips: '+entry.coaching));}
    const buttons=document.createElement('div');buttons.className='archive-actions';
    if(uploaded){
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
      const print=document.createElement('button');print.type='button';print.textContent='Skriv ut övning';
      print.addEventListener('click',()=>{const win=window.open('','_blank');if(!win)return;const doc=win.document;doc.title=entry.title;const h=doc.createElement('h1');h.textContent=entry.title;doc.body.append(h);for(const value of ['Kategori: '+entry.category,'Tid: '+entry.minutes+' min','Övning: '+entry.description,'Material: '+entry.equipment,'Tränartips: '+entry.coaching]){doc.body.append(text.call(null,'p',value));}win.print();});
      buttons.append(print);
    }
    card.append(buttons);return card;
  }
  async function render(){
    const list=$('exerciseList');list.replaceChildren();
    for(const entry of items.filter(match))list.append(makeCard(entry,false));
    const container=$('exerciseUserFiles');container.replaceChildren();
    try{
      const files=(await getFiles()).sort((a,b)=>b.created-a.created);
      for(const entry of files.filter(match))container.append(makeCard(entry,true));
      if(!files.length)container.append(text('p','Inga egna filer sparade ännu.'));
      $('exerciseStatus').textContent=items.filter(match).length+' färdiga övningar · '+files.filter(match).length+' egna filer';
    }catch{container.append(text('p','Filarkivet kunde inte öppnas i den här webbläsaren.'));$('exerciseStatus').textContent='De färdiga övningarna är tillgängliga.';}
  }
  document.addEventListener('DOMContentLoaded',()=>{
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
