const HOSTS=new Set(['cuponline.se','www.cuponline.se']);
export function cupAddress(value){
 let url;try{url=new URL(value);}catch{throw Error('Ange en giltig Cuponline-adress.');}
 const ids=[...url.searchParams].filter(([key])=>key.toLowerCase()==='cupid').map(([,value])=>value);
 if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.port||url.username||url.password||!['/start.aspx','/information.aspx'].includes(url.pathname.toLowerCase())||ids.length!==1||! /^[1-9][0-9]{0,8}$/.test(ids[0]))throw Error('Använd en Cuponline-adress med cupid, till exempel start.aspx?cupid=39900.');
 return {cupId:ids[0],sourceUrl:'https://cuponline.se/start.aspx?cupid='+ids[0]};
}
const decode=s=>String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|aring|Aring|auml|Auml|ouml|Ouml);/g,(_m,v)=>{if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',aring:'å',Aring:'Å',auml:'ä',Auml:'Ä',ouml:'ö',Ouml:'Ö'}[v];});
const clean=s=>String(s).replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
export const cupText=html=>decode(clean(html).replace(/<(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'')).replace(/[\t\r ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const attr=(tag,key)=>decode(tag.match(new RegExp('(?:^|\\s)'+key+'\\s*=\\s*["\']([^"\']*)["\']','i'))?.[1]||'');
function element(html,predicate){
 const tags=/<([a-z][\w-]*)\b[^>]*>/gi;let match;
 while((match=tags.exec(html))){if(!predicate(match[0]))continue;const name=match[1],begin=tags.lastIndex,scan=new RegExp('<(/?)'+name+'\\b[^>]*>','gi');scan.lastIndex=begin;let depth=1,next;while((next=scan.exec(html))){depth+=next[1]?-1:1;if(!depth)return html.slice(begin,next.index);}return '';}
 return '';
}
const byId=(html,id)=>element(html,tag=>attr(tag,'id')===id);
const meta=(html,key)=>[...html.matchAll(/<meta\b[^>]*>/gi)].map(m=>m[0]).find(tag=>[attr(tag,'name'),attr(tag,'property')].includes(key))||'';
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
export function parseCupPages(address,pages,now=new Date()){
 const {cupId,sourceUrl}=cupAddress(address),html=clean(pages.start||'');
 const name=attr(meta(html,'og:title'),'content')||cupText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
 if(!name||!html.includes('cuponline-main'))throw Error('Cuponline-sidan innehåller ingen läsbar cup. Kontrollera adressen.');
 const description=attr(meta(html,'description'),'content'),dates=description.match(/Spelas\s+(\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{4}-\d{2}-\d{2})/i);
 const info=cupText(element(html,tag=>attr(tag,'class').split(/\s+/).includes('editor-container')));
 const teams=[...new Set([...clean(pages.teams||'').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m=>{try{const u=new URL(attr(m[1],'href'),sourceUrl);return HOSTS.has(u.hostname)&&['/team.aspx','/teamview.aspx'].includes(u.pathname.toLowerCase());}catch{return false;}}).map(m=>cupText(m[2]).replace(/\s+/g,' ').slice(0,300)).filter(Boolean))].slice(0,128);
 const schedule=[];let scheduleHeaders=[];
 const games=byId(clean(pages.games||''),'cuponline-main');
 for(const row of games.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const headers=[...row[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(m=>cupText(m[1]).slice(0,300));if(headers.length)scheduleHeaders=headers.slice(0,15);
  const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>cupText(m[1]).slice(0,300));
  if(cells.length>=3&&cells.some(c=>/\b\d{1,2}[:.]\d{2}\b/.test(c)))schedule.push(cells.slice(0,15));if(schedule.length>=200)break;
 }
 return {cupId,sourceUrl,name:name.slice(0,200),startDate:dates&&validDate(dates[1])?dates[1]:'',endDate:dates&&validDate(dates[2])?dates[2]:'',dateLabel:cupText(byId(html,'ctl00_cup_date')).slice(0,150),place:cupText(byId(html,'ctl00_cup_play_place')).slice(0,200),age:cupText(byId(html,'ctl00_cup_players_age')).slice(0,100),info:info.slice(0,20000),teams,schedule,scheduleHeaders,arenas:cupText(byId(clean(pages.arenas||''),'cuponline-main')).slice(0,6000),fetchedAt:now.toISOString(),warnings:[]};
}
async function boundedText(response,max=1000000){
 const reader=response.body?.getReader();if(!reader)throw Error('Tomt svar från Cuponline.');const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw Error('Svaret från Cuponline är för stort.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(bytes);
}
export async function importCuponline(value,fetcher=fetch){
 const address=cupAddress(value);
 async function page(path){
  let url='https://cuponline.se/'+path+'?cupid='+address.cupId;
  for(let hop=0;hop<3;hop++){
   const response=await fetcher(url,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000)});
   if(response.status>=300&&response.status<400){const next=new URL(response.headers.get('location')||'',url);if(next.protocol!=='https:'||!HOSTS.has(next.hostname)||next.port||next.username||next.password||next.pathname.toLowerCase()!=='/'+path||[...next.searchParams].filter(([key])=>key.toLowerCase()==='cupid').map(([,value])=>value).join(',')!==address.cupId)throw Error('Cuponline omdirigerade till en annan adress.');url=next.href;continue;}
   if(!response.ok)throw Error('Cuponline kunde inte läsas ('+response.status+').');
   if(!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('Cuponline gav inget läsbart HTML-svar.');
   return boundedText(response);
  }
  throw Error('För många omdirigeringar från Cuponline.');
 }
 const start=await page('start.aspx');
 const optional=await Promise.allSettled(['teams.aspx','games.aspx','arenas.aspx'].map(page));
 const pages={start};for(const [index,key]of ['teams','games','arenas'].entries())if(optional[index].status==='fulfilled')pages[key]=optional[index].value;
 const cup=parseCupPages(address.sourceUrl,pages);cup.warnings=optional.flatMap((r,i)=>r.status==='rejected'?[['Lagen','Spelschemat','Halluppgifterna'][i]+' kunde inte hämtas.']:[]);return cup;
}
export async function limitedCupBody(request){const raw=await boundedText(request,140000);try{return JSON.parse(raw);}catch{throw Error('Ogiltiga cupuppgifter.');}}
export function validCup(cup){
 if(!cup||typeof cup!=='object'||Array.isArray(cup))return false;
 try{const a=cupAddress(cup.sourceUrl);if(a.cupId!==cup.cupId)return false;}catch{return false;}
 const limits={cupId:9,sourceUrl:200,name:200,startDate:10,endDate:10,dateLabel:150,place:200,age:100,info:20000,arenas:6000,fetchedAt:40};
 if(Object.keys(cup).some(key=>!Object.hasOwn(limits,key)&&!['teams','schedule','scheduleHeaders','warnings'].includes(key))||Object.entries(limits).some(([key,max])=>typeof cup[key]!=='string'||cup[key].length>max)||!cup.name.trim()||[cup.startDate,cup.endDate].some(s=>s&&!validDate(s))||Number.isNaN(Date.parse(cup.fetchedAt)))return false;
 const strings=(items,max,count)=>Array.isArray(items)&&items.length<=count&&items.every(s=>typeof s==='string'&&s.length<=max);
 return strings(cup.teams,300,128)&&strings(cup.scheduleHeaders,300,15)&&strings(cup.warnings,300,4)&&Array.isArray(cup.schedule)&&cup.schedule.length<=200&&cup.schedule.every(row=>strings(row,300,15));
}
export {boundedText,cupText as textFromCupHtml,attr as cupAttribute,element as cupElement};
