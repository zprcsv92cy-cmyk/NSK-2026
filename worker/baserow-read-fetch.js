// Retry only safe Baserow reads. Writes and other providers are never replayed.
const pendingReads=new WeakMap();
export async function fetchBaserowRead(input,init,options={}){
 const fetcher=options.fetcher||globalThis.fetch,url=new URL(input instanceof Request?input.url:String(input));
 const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 if(url.origin!=='https://api.baserow.io'||method!=='GET'||init?.signal||input instanceof Request)return readBaserow(input,init,{...options,fetcher});
 // Share only identical in-flight upstream GETs, partitioned by fetcher and all headers.
 // Each caller receives its own body; completed responses are never cached.
 const headers=new Headers(input instanceof Request?input.headers:undefined);for(const [name,value] of new Headers(init?.headers))headers.set(name,value);
 const key=JSON.stringify([url.href,[...headers].sort(([a],[b])=>a.localeCompare(b))]);
 let pending=pendingReads.get(fetcher);if(!pending){pending=new Map();pendingReads.set(fetcher,pending);}
 let request=pending.get(key);
 if(!request){request=bufferRead(input,init,{...options,fetcher});pending.set(key,request);const clear=()=>{if(pending.get(key)===request)pending.delete(key);};request.then(clear,clear);}
 const result=await request;
 return new Response(result.body,{status:result.status,statusText:result.statusText,headers:result.headers});
}
// Live streams belong to their creating Workers request. Share bounded plain data only.
async function bufferRead(input,init,options){
 const response=await readBaserow(input,init,options),chunks=[];let size=0;
 if(response.body){const reader=response.body.getReader();for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw Error('Baserow response exceeds shared read limit');}chunks.push(value);}}
 const body=response.body?new Uint8Array(size):null;let offset=0;
 for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
 return {body,status:response.status,statusText:response.statusText,headers:[...response.headers]};
}
async function readBaserow(input, init, {fetcher=globalThis.fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=event=>console.warn(JSON.stringify(event))}={}) {
  const url=new URL(input instanceof Request?input.url:String(input));
  const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(url.origin!=='https://api.baserow.io'||method!=='GET')return fetcher(input,init);
  for(let attempt=0;attempt<2;attempt++){
    let response;
    try{response=await fetcher(input,init);}catch(error){
      log({event:'baserow_read_failure',kind:'network',attempt:attempt+1});
      if(attempt||init?.signal?.aborted)throw error;
      await wait(300);continue;
    }
    const transient=[429,502,503,504].includes(response.status);
    if(!response.ok)log({event:'baserow_read_failure',status:response.status,attempt:attempt+1});
    if(!transient||attempt)return response;
    const retryAfter=response.headers.get('retry-after');
    const seconds=retryAfter===null?0:Number(retryAfter);
    // Respect long server cooldowns by failing rather than retrying prematurely.
    if(retryAfter!==null&&(!Number.isFinite(seconds)||seconds<0||seconds>2))return response;
    await response.body?.cancel();
    await wait(Math.max(300,seconds*1000));
  }
}
