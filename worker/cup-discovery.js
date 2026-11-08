import {cupAddress,cupText,cupAttribute as attr,cupElement as element,boundedText,importCuponline} from './cuponline-import.js';
const ENTRY='https://cuponline.se/web/default.aspx?nomobile=true',DESKTOP='https://cuponline.se/web/sok-cup.aspx?nomobile=true',PAGE_SIZE=5;
const months={jan:1,feb:2,mar:3,apr:4,maj:5,jun:6,jul:7,aug:8,sep:9,okt:10,nov:11,dec:12};
function date(year,month,day){const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;return !Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value?value:'';}
export function directoryDates(label){
 const text=label.toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ').trim(),iso=text.match(/(\d{4}-\d{2}-\d{2})(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/);
 if(iso){const start=iso[1],end=iso[2]||start;return [start,end].every(value=>date(...value.split('-').map(Number))===value)?{startDate:start,endDate:end}:null;}
 let match=text.match(/^(\d{1,2})\s*([a-zåäö]+)?\s*(\d{4})?\s*-\s*(\d{1,2})\s*([a-zåäö]+)\s*(\d{4})$/);
 if(match){const endMonth=months[match[5].slice(0,3)],startMonth=match[2]?months[match[2].slice(0,3)]:endMonth,endYear=Number(match[6]),startYear=Number(match[3]||endYear-(startMonth>endMonth?1:0)),start=date(startYear,startMonth,Number(match[1])),end=date(endYear,endMonth,Number(match[4]));return start&&end&&start<=end?{startDate:start,endDate:end}:null;}
 match=text.match(/^(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})$/);if(!match)return null;const value=date(Number(match[3]),months[match[2].slice(0,3)],Number(match[1]));return value?{startDate:value,endDate:value}:null;
}
export function matchesCupAge(label,age){
 const wanted=Number(age.slice(1));
 return [...String(label).toUpperCase().matchAll(/\bU\s*(\d{1,2})(?:\s*[-–]\s*U?\s*(\d{1,2}))?\b/g)].some(m=>m[2]?wanted>=Number(m[1])&&wanted<=Number(m[2]):wanted===Number(m[1]));
}
export function parseCupDirectory(html){
 const scoped=element(html,tag=>/_grdSearch$/i.test(attr(tag,'id')))||html,found=new Map();
 for(const row of scoped.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const raw=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);if(raw.length!==6)continue;
  const link=[...raw[0].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].find(m=>/start\.aspx/i.test(attr(m[1],'href')));if(!link)continue;
  let address;try{const url=new URL(attr(link[1],'href'),'https://cuponline.se/');if(url.hostname==='m.cuponline.se')url.hostname='cuponline.se';address=cupAddress(url.href);}catch{continue;}
  const cells=raw.map(c=>cupText(c).replace(/\s+/g,' ').trim()),dates=directoryDates(cells[2]);if(!dates||! /^(ishockey|icehockey|ice hockey)$/i.test(cells[4]))continue;
  const item={...address,name:cupText(link[2]).slice(0,200),age:cells[1].slice(0,100),dateLabel:cells[2].slice(0,150),...dates,place:cells[5].slice(0,200)};
  if(item.name&&!found.has(item.cupId))found.set(item.cupId,item);
 }
 return [...found.values()];
}
async function cached(key,loader,cache){
 const request=new Request('https://cuponline.se/nsk-discovery-cache/'+key);
 try{const hit=await cache?.match(request);if(hit)return await hit.json();}catch{}
 const data=await loader();try{if(cache)await cache.put(request,Response.json(data,{headers:{'Cache-Control':'public, max-age=300'}}));}catch{}return data;
}
export async function readCupDirectory(fetcher){
 async function read(url){const response=await fetcher(url,{redirect:'manual',headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000)});if(!response.ok||!/text\/html/i.test(response.headers.get('content-type')||''))throw Error('Cuplistan kunde inte läsas.');return boundedText(response);}
 const entry=await read(ENTRY);
 const hasSearch=[...entry.matchAll(/<a\b([^>]*)>/gi)].some(m=>{try{const url=new URL(attr(m[1],'href'),ENTRY);return ['cuponline.se','www.cuponline.se'].includes(url.hostname)&&url.protocol==='https:'&&url.pathname.toLowerCase()==='/web/sok-cup.aspx';}catch{return false;}});
 if(!hasSearch)throw Error('Länken till Cuponlines cupsökning kunde inte hittas.');
 const items=parseCupDirectory(await read(DESKTOP));if(!items.length)throw Error('Cuplistan innehöll inga läsbara cuper.');
 return {source:ENTRY,indexSource:DESKTOP,notice:'',items};
}
export function cupFees(info){
 const lines=String(info).split('\n').map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean),found=[];
 const label=/avgift|kostnad|\bpriser?\b|extra\s+ledar/i,money=/\d[\d .,]*\s*(?:kr(?:onor)?\b|sek\b|eur\b|euro\b|€|:-)/i;
 for(let i=0;i<lines.length;i++){
  if(!label.test(lines[i])||/^(?:avgifter|kostnader|priser)\s*:?$/i.test(lines[i]))continue;
  let line=lines[i];
  for(let j=1;j<=3&&!money.test(line)&&i+j<lines.length;j++){
   if(label.test(lines[i+j]))break;
   line+=' '+lines[i+j];
  }
  if(money.test(line))found.push(line.slice(0,700));
 }
 return [...new Set(found)].filter((line,i,all)=>!all.some((other,j)=>i!==j&&line.length>other.length&&line.endsWith(other))).slice(0,8);
}

export async function discoverCups(age,offset=0,{fetcher=fetch,cache=globalThis.caches?.default,now=new Date()}={}){
 if(!/^U(?:[7-9]|1[0-9]|20)$/.test(age)||!Number.isSafeInteger(offset)||offset<0||offset>1000)throw Error('Välj en åldersklass mellan U7 och U20.');
 const directory=await cached('directory-desktop-v1',()=>readCupDirectory(fetcher),cache),today=now.toLocaleDateString('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'});
 const items=directory.items.filter(cup=>cup.startDate>=today&&matchesCupAge(cup.age,age)).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.name.localeCompare(b.name,'sv'));
 const selected=items.slice(offset,offset+PAGE_SIZE),results=await Promise.all(selected.map(async item=>{
  try{const cup=await cached('cup-v1-'+item.cupId,()=>importCuponline(item.sourceUrl,fetcher),cache);return {...item,cup,fees:cupFees(cup.info),detailError:'',teamsAvailable:!cup.warnings.some(w=>w.startsWith('Lagen'))};}
  catch{return {...item,cup:null,fees:[],detailError:'Lag och avgifter kunde inte hämtas. Öppna cupen för att försöka igen.',teamsAvailable:false};}
 }));
 return {age,source:directory.source,notice:directory.notice,total:items.length,items:results,nextOffset:offset+selected.length<items.length?offset+selected.length:null,fetchedAt:now.toISOString()};
}
