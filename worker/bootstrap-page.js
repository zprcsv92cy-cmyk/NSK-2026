export const bootstrapPage = `<!doctype html><html lang="sv"><meta charset="utf-8"><title>NSK testkonto</title><h1>Skapa testkod</h1><form id="setup"><label>Nyckel <input type="password" id="key"></label><button>Skapa kod</button></form><p id="status"></p><script>
document.getElementById('setup').onsubmit=async e=>{
e.preventDefault();
const field=document.getElementById('key');
const secret=field.value;field.value='';
const status=document.getElementById('status');
status.textContent='Skapar kod...';
try{
const response=await fetch('/api/auth/staging/bootstrap-test',{method:'POST',headers:{'X-NSK-Bootstrap-Secret':secret}});
const result=await response.json();
status.textContent=response.ok?'Aktiveringskod: '+result.token:(result.error||'Fel');
}catch(error){status.textContent='Nätverksfel';}
};
</script></html>`;
