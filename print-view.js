// Print a static document in its own tab, outside the app's retained iframes.
(() => {
 const buttons='#shiftPrintButton,#lineupPrintButton,#rosterPrintButton,#goaliePrintButton,#matchviewPrintButton,#trainingPrintButton';
 function ready(){
  const $=id=>document.getElementById(id);
  if($('shiftPrintButton'))return !!$('shiftTableWrap')?.querySelector('tbody tr')&&$('shiftTableWrap').getAttribute('aria-busy')!=='true';
  if($('lineupPrintButton'))return $('lineupSelectors')?.getAttribute('aria-busy')!=='true'&&!!$('lineupGoalie')?.value&&[...document.querySelectorAll('#lineupSelectors select[id^=lineupPlayer]')].filter(e=>e.style.display!=='none').every(e=>e.value)&&!!$('lineupSelectors')?.querySelector('select[id^=lineupPlayer]');
  if($('rosterPrintButton'))return !!$('playersList')?.children.length;
  if($('goaliePrintButton'))return !!document.querySelector('tbody tr');
  if($('matchviewPrintButton'))return !!$('currentPlayers')?.textContent.trim()&&$('currentPlayers').textContent.trim()!=='—';
  if($('trainingPrintButton'))return !!document.querySelector('.training-group li');
  return true;
 }
 function snapshot(root){
  const copy=root.cloneNode(true),sourceControls=[...root.querySelectorAll('input,select,textarea')],controls=[...copy.querySelectorAll('input,select,textarea')];
  for(const button of copy.querySelectorAll('.person-card-open,.shift-check')){const text=document.createElement('span');text.textContent=button.textContent;button.replaceWith(text);}
  controls.forEach((control,index)=>{
   const source=sourceControls[index];
   if(['password','hidden','file','search'].includes(source.type)){control.remove();return;}
   const text=document.createElement('span');text.className=control.className;text.id=control.id;text.style.cssText=control.style.cssText;
   text.textContent=source.tagName==='SELECT'?[...source.selectedOptions].map(o=>o.textContent).join(', '):['checkbox','radio'].includes(source.type)?(source.checked?'✓':'□'):source.value;
   control.replaceWith(text);
  });
  copy.querySelectorAll('script,iframe,object,embed,dialog,nav,button,.no-print,.roster-add-row,.lineup-print-row,.shift-top-grid,.coach-picker,#laguppstallningTeamButtons,#matchButtons,#shiftTeamButtons,#shiftMatchList,.training-attendance,.training-controls,.training-roster,.training-actions,.archive-toolbar,.archive-file-form,.archive-actions,.archive-preview-actions,.person-card-open svg,.data-freshness,#matchReadiness,#shiftMsg,#appError,.lineup-messages,#shiftHeaderMain,[hidden]').forEach(n=>n.remove());
  for(const node of copy.querySelectorAll('*'))for(const attribute of [...node.attributes])if(/^on/i.test(attribute.name))node.removeAttribute(attribute.name);
  for(const image of copy.querySelectorAll('img'))image.src=new URL(image.getAttribute('src'),location.href).href;
  return copy;
 }
 function preview(title,content){
  const tab=window.open('','_blank');if(!tab)throw Error('Utskriftsvyn kunde inte öppnas. Tillåt popupfönster och försök igen.');
  const doc=tab.document;doc.open();doc.write('<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');doc.close();doc.title=title;
  for(const source of document.head.querySelectorAll('link[rel=stylesheet],style')){const node=source.cloneNode(true);if(node.tagName==='LINK')node.href=source.href;doc.head.append(node);}
  const style=doc.createElement('style');style.textContent='html,body{position:static!important;height:auto!important;max-height:none!important;min-height:0!important;overflow:visible!important;background:#fff!important;color:#111!important}body{margin:0!important;padding:16px!important;font:15px/1.45 system-ui,sans-serif}.arena-scroll{display:contents!important}.wrap{width:100%!important;max-width:1000px!important;margin:auto!important;padding:0!important}.card{background:white!important;color:#111!important;box-shadow:none!important;break-inside:auto!important}.card h1,.card h2,.card h3,label,.small,.sub{color:#222!important}.home-hero-sub,.pool-flow-context,.shift-info-name{color:#333!important}.coach-picker{display:none!important}#lineupCoachNames{display:block!important}table{width:100%!important;border-collapse:collapse}th,td{color:#111!important;background:white!important;border:1px solid #aaa;padding:7px!important}tr{break-inside:avoid}img,svg{max-width:100%}.nsk-print-toolbar{max-width:1000px;margin:0 auto 20px;padding-bottom:14px;border-bottom:1px solid #aaa}.nsk-print-toolbar h1{font-size:21px}.nsk-print-toolbar button{display:inline-block!important;min-height:48px;margin:0 8px 8px 0;padding:10px 16px;background:white;color:#111;border:1px solid #777;border-radius:8px;font:inherit}.nsk-print-toolbar p{font-size:14px}.nsk-print-toolbar button:disabled{opacity:.5}.archive-preview{position:static!important;display:block!important;background:white!important;color:#111!important;max-height:none!important;overflow:visible!important}.archive-preview-body,.archive-preview-text{max-height:none!important;overflow:visible!important}.archive-preview-image{height:auto!important;max-height:none!important}#skillsPrintout{display:block!important;color:#111!important}.skills-printing>*:not(#skillsPrintout):not(.nsk-print-toolbar){display:none!important}@media print{@page{margin:12mm}body{padding:0!important}.nsk-print-toolbar{display:none!important}.card{break-inside:auto!important}thead{display:table-header-group}a{color:inherit!important;text-decoration:none}}';doc.head.append(style);
  doc.body.className=document.body.className.replace(/\bnsk-arena\b|\bnsk-shell\b/g,'');
  const toolbar=doc.createElement('header');toolbar.className='nsk-print-toolbar';const heading=doc.createElement('h1');heading.textContent=title;
  const print=doc.createElement('button');print.type='button';print.textContent='Skriv ut / Spara PDF';print.disabled=true;
  const close=doc.createElement('button');close.type='button';close.textContent='Stäng';close.onclick=()=>tab.close();
  const status=doc.createElement('p');status.setAttribute('role','status');status.textContent='Förbereder utskriften…';toolbar.append(heading,print,close,status);doc.body.append(toolbar,doc.importNode(content,true));
  print.onclick=()=>{tab.focus();tab.print();};
  const assets=[...doc.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.onload=resolve;img.onerror=resolve;}));
  assets.push(...[...doc.querySelectorAll('link[rel=stylesheet]')].map(link=>link.sheet?Promise.resolve():new Promise(resolve=>{link.onload=resolve;link.onerror=resolve;})));
  Promise.all(assets).then(()=>{if(tab.closed)return;print.disabled=false;status.textContent='Klar. På iPhone kan utskriften sparas som PDF via delningsknappen i utskriftsvyn.';});
  tab.opener=null;tab.focus();return tab;
 }
 window.NSKPrint={ready,snapshot,preview};
 window.print=()=>{
  if(!ready()){window.alert('Uppgifterna är inte färdigladdade. Försök igen när innehållet visas.');return;}
  const root=document.body.classList.contains('skills-printing')?document.getElementById('skillsPrintout'):document.body.classList.contains('archive-preview-print')?document.querySelector('.archive-preview'):document.querySelector('.wrap');
  if(!root)throw Error('Utskriftsunderlaget saknas.');
  const pdf=root.querySelector('iframe[src^="blob:"]');
  if(pdf){const tab=window.open(pdf.src,'_blank');if(!tab)throw Error('Tillåt popupfönster för att öppna PDF-filen.');tab.opener=null;return;}
  const content=snapshot(root);
  if(document.getElementById('trainingDate')){const info=document.createElement('p');info.textContent=[document.getElementById('trainingDate').value,document.getElementById('trainingHall')?.value].filter(Boolean).join(' · ');content.prepend(info);}
  try{preview(document.title,content);window.dispatchEvent(new Event('afterprint'));}catch(error){window.alert(error.message);}
 };
 const sync=()=>{const enabled=ready();for(const button of document.querySelectorAll(buttons)){button.disabled=!enabled;button.title=enabled?'':'Väntar på uppgifter';}};
 document.addEventListener('DOMContentLoaded',()=>{sync();new MutationObserver(sync).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-busy']});});
})();
