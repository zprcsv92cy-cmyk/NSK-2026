import {validateTrainingPayload} from './training-session-validation.js';
import {mergeConcurrent,mergeTraining,trainingSnapshot} from '../concurrency-merge.mjs';
const response=(status,error)=>Response.json({ok:false,error},{status,headers:{'Cache-Control':'private, no-store'}});
// Reuse the existing authenticated handler and its atomic revision comparison.
export function withConcurrentResources(handler){
 return async function(request,...args){
  const url=new URL(request.url),card=url.pathname==='/api/person-card',training=url.pathname==='/api/training';
  if(args[0]?.NSK_MULTIUSER_ENABLED!=='true')return handler(request,...args);
  if(request.method!=='PUT'||!card&&!training&&url.pathname!=='/api/equipment')return handler(request,...args);
  try{
   const reader=request.clone().body?.getReader();let size=0,text='';const decoder=new TextDecoder();
   if(!reader)return response(400,'Tom begäran');
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>(card?16000:training?32000:400000)){void reader.cancel();void request.body?.cancel();return response(413,'För mycket data');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
   let payload;try{payload=JSON.parse(text);}catch{return response(400,'Ogiltig data');}
   if(!Object.hasOwn(payload||{},'base'))return handler(request,...args);
   const {base,...submitted}=payload,keys=card?['card']:training?['session']:['requests','checklists'];
   if(!Number.isSafeInteger(submitted.revision)||submitted.revision<0||training&&!validateTrainingPayload(submitted))return response(400,'Ogiltiga uppgifter');
   if(!base||typeof base!=='object'||Array.isArray(base)||Object.keys(base).length!==keys.length||keys.some(k=>!Object.hasOwn(base,k)))return response(400,'Ogiltig sparversion');
   for(let retry=0;retry<4;retry++){
    const read=await handler(new Request(request.url,{headers:request.headers}),...args);if(!read.ok)return read;
    const latest=await read.json();let merged={...submitted,revision:latest.revision};
    if(training)merged={...mergeTraining(base.session,trainingSnapshot(submitted),trainingSnapshot(latest.session)),revision:latest.revision};
    else for(const key of keys)merged[key]=mergeConcurrent(base[key],submitted[key],latest[key]);
    const result=await handler(new Request(request.url,{method:'PUT',headers:request.headers,body:JSON.stringify(merged)}),...args);
    if(result.status!==409){if(result.ok&&training){const saved=await result.json();return new Response(JSON.stringify({...saved,session:trainingSnapshot(merged)}),{status:result.status,headers:result.headers});}return result;}
   }
   return response(409,'Uppgifterna ändras just nu. Dina ändringar finns kvar. Försök spara igen.');
  }catch(error){return response(error.status||503,error.status?error.message:'Sparningen kunde inte slutföras. Dina ändringar finns kvar.');}
 };
}
