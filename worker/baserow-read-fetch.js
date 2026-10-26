// Retry only safe Baserow reads. Writes and other providers are never replayed.
export async function fetchBaserowRead(input, init, {fetcher=globalThis.fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=event=>console.warn(JSON.stringify(event))}={}) {
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
