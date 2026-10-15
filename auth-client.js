// Shared browser authentication client for the EXISTING NSK app.
// Opt-in integration only. Never send the bearer token to the legacy API origin.
(function(global){
  'use strict';
  const state={token:null,identity:null};
  const defaultOrigin='https://nsk-auth-staging.peter-hasselberg.workers.dev';
  function origin(){return String(global.APP_CONFIG?.AUTH_URL||defaultOrigin).replace(/\/$/,'');}
  async function call(path,options={}){
    if(!/^\/api\/auth\//.test(path))throw Error('Endast autentiserings-API tillåtet');
    const headers=new Headers(options.headers||{});
    if(state.token)headers.set('Authorization','Bearer '+state.token);
    const response=await fetch(origin()+path,{...options,headers,cache:'no-store',credentials:'omit'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401 && path!=='/api/auth/login'){
        state.token=null;
        state.identity=null;
      }
      throw Object.assign(Error(data.error||'Begäran misslyckades'),{status:response.status});
    }
    return data;
  }
  async function login(email,password){
    state.token=null;state.identity=null;
    const result=await call('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password})});
    state.token=result.token;
    try{state.identity=await call('/api/auth/me');return state.identity;}
    catch(error){state.token=null;throw error;}
  }
  async function logout(){
    try{if(state.token)await call('/api/auth/logout',{method:'POST'});}
    finally{state.token=null;state.identity=null;}
  }
  function teamAccess(teamId,permission){
    return !!state.identity?.memberships?.some(m=>m.team_id===teamId&&m.role==='team_admin')&&
      !!state.identity?.permissions?.includes(permission);
  }
  global.NSK_AUTH={login,logout,me:()=>state.identity,teamAccess,
    // Only send tokens to an auth endpoint, never directly to the old data API.
    authRequest:(path,options)=>{if(!state.token)throw Error('Inte inloggad');return call(path,options);}};
})(window);
