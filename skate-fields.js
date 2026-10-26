(() => {
 const profileGroups=[
  ['SINGELPROFILER (En radie)',[
   ['9 ft','Maximal rörlighet och snabba vändningar, mindre glid'],
   ['10 ft','Standardradie för de flesta Bauer-skridskor direkt från fabrik'],
   ['11 ft','Standardradie för de flesta CCM-skridskor direkt från fabrik'],
   ['13 ft','Mycket iskontakt, hög stabilitet och bra glid (bra för bandy/nybörjare)'],
   ['15 ft','Maximal stabilitet och glid, främst för bandy eller tunga åkare']
  ]],
  ['DUBBELPROFILER (Två radier)',[
   ['Combi (9-10 ft)','Balans mellan kvickt löpsteg och ökad åkyta'],
   ['Combi (10-13 ft)','Fokus på glid men med bibehållen rörlighet framtill'],
   ['Detroit 1','Klassisk dubbelprofil med aggressiv, inbyggd framåtlutning'],
   ['Detroit 2','Samma som Detroit 1 fast med längre radier för tyngre spelare'],
   ['Win 1','Fokus på kraftfull skridskoåkning och stabilitet i hög fart'],
   ['Win 2','Anpassad variant av Win för längre skenor och större spelare'],
   ['Toronto','Optimerad för maximal fart och glid i långa skär']
  ]],
  ['TRIPPELPROFILER (Tre radier)',[
   ['Zuperior 3XS','Trippelprofil för de allra minsta skridskostorlekarna'],
   ['Zuperior 2XS','Trippelprofil för barnskridskor'],
   ['Zuperior XS','För mindre juniorstorlekar, ger extremt kvick acceleration'],
   ['Zuperior Small','För större juniorer eller mindre seniorstorlekar'],
   ['Zuperior Medium','Standardstorleken för seniorer, mycket populär bland forwards'],
   ['Zuperior Large','För stora skridskostorlekar och tyngre spelare']
  ]],
  ['QUAD-PROFILER (Fyra radier)',[
   ['Quad 3XS','Fyrdelad profil för de allra minsta skridskorna'],
   ['Quad 2XS','För mindre barnskridskor'],
   ['Quad XS','För juniorstorlekar, kombinerar acceleration, rörlighet, fart och hälstabilitet'],
   ['Quad Small','För stora juniorer eller mindre seniorer'],
   ['Quad Medium','Den mest populära allroundprofilen för seniorspelare på elitnivå'],
   ['Quad Large','För stora seniorskridskor'],
   ['Quad 0','Gammal beteckning (motsvarar ungefär Quad XS/Small)'],
   ['Quad 1','Gammal beteckning (motsvarar ungefär Quad Medium)'],
   ['Quad 2','Gammal beteckning (motsvarar ungefär Quad Large)']
  ]]
 ];
 const profileDescription=value=>profileGroups.flatMap(([,items])=>items).find(([name])=>name===value)?.[1]||'';

 const fields=['model','hollow','profile','notes'];
 function options(hollow,profile,values={}){hollow.replaceChildren(new Option('Ej angivet',''));for(let n=15;n<=25;n++)hollow.append(new Option(n+' mm',n+' mm'));profile.replaceChildren(new Option('Ej angivet',''));for(const [label,items] of profileGroups){const group=document.createElement('optgroup');group.label=label;for(const [name,description] of items){const o=new Option(name,name);o.title=description;group.append(o);}profile.append(group);}for(const [select,key] of [[hollow,'hollow'],[profile,'profile']]){const value=values[key]??(key==='hollow'?'17 mm':'');if(value&&![...select.options].some(o=>o.value===value))select.append(new Option('Tidigare värde: '+value,value));select.value=value;}}
 function editor(root,values={}){root.replaceChildren();const inputs={};for(const [key,title] of [['model','Skridskomodell'],['hollow','Skålradie'],['profile','Profilering'],['notes','Skridskoanteckningar']]){const label=document.createElement('label');label.textContent=title;const input=document.createElement(['hollow','profile'].includes(key)?'select':key==='notes'?'textarea':'input');input.setAttribute('aria-label',title);input.maxLength=key==='notes'?500:100;input.value=values[key]||'';label.append(input);root.append(label);inputs[key]=input;}options(inputs.hollow,inputs.profile,values);const help=document.createElement('small');root.append(help);const update=()=>{help.textContent=profileDescription(inputs.profile.value);};inputs.profile.onchange=update;update();return {get:()=>Object.fromEntries(fields.map(key=>[key,inputs[key].value.trim()]))};}
 window.SkateFields={profileGroups,profileDescription,options,editor};
})();
