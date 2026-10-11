ÄNDRINGAR I db.js – ersätt endast funktionen setShiftDone och lägg till matchRequest.

1. Lägg följande funktion precis före `async function setShiftDone(`:

  async function matchRequest(path, payload) {
    const key='nsk_match_token';
    async function send(token) {
      const response=await fetch(`${API}${path}`,{
        method:'PATCH',
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify(payload)
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok || !data.ok)throw Object.assign(new Error(data.error||'Kunde inte spara byte'),{status:response.status});
      return data;
    }
    let token=localStorage.getItem(key);
    if(token){
      try{return await send(token)}
      catch(error){if(error.status!==401)throw error;localStorage.removeItem(key);}
    }
    // Admin users can still mark shifts without entering a separate match code.
    const adminToken=localStorage.getItem('nsk_admin_token');
    if(adminToken){
      try{return await send(adminToken)}
      catch(error){if(error.status!==401)throw error;}
    }
    const password=window.prompt('Ange gemensam matchkod för att spara genomförda byten:');
    if(password===null)throw new Error('Ingen matchkod angavs.');
    if(!password.trim())throw new Error('Matchkod saknas.');
    const loginResponse=await fetch(`${API}/api/match/login`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})
    });
    const loginData=await loginResponse.json().catch(()=>({}));
    if(!loginResponse.ok || !loginData.ok || !loginData.token)throw new Error(loginData.error||'Fel matchkod');
    localStorage.setItem(key,loginData.token);
    return send(loginData.token);
  }

2. Ersätt ENDAST befintliga funktionen setShiftDone med:

  async function setShiftDone(poolId,lagNo,matchNo,shiftNo,done){
    return serialWrite(async()=>{
      const shifts=await listShiftSchema(poolId,lagNo,matchNo);
      const shift=shifts.find(s=>s.shift_no===Number(shiftNo));
      if(!shift)throw new Error('Bytet hittades inte');
      return matchRequest(`/api/bytesschema/${shift.id}/done`,{done:!!done});
    });
  }

Ingen annan funktion i db.js behöver ändras. Detta bevarar API:t till app.js.

3. Efter uppdatering av db.js, öka cacheversionen på sidornas script-taggar för db.js (t.ex. ?v=3).
