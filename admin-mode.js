(()=>{
const API='https://nsk-api.peter-hasselberg.workers.dev';
const KEY='nsk_admin_token';
const css=document.createElement('style');
css.textContent=`
#nsk-admin-bar{position:static!important;inset:auto!important;float:none!important;z-index:auto!important;display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;box-sizing:border-box;width:100%;max-width:100%;margin:0 0 10px;padding:0;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;font:14px system-ui,sans-serif;color:inherit}
#nsk-admin-bar button{font:inherit;font-weight:600;padding:7px 12px;cursor:pointer;border:1px solid #777;border-radius:8px;background:#fff;color:#14202b;max-width:100%}
#nsk-admin-bar .nsk-admin-status{font-size:12px;opacity:.8}
@media(max-width:600px){#nsk-admin-bar{margin-bottom:8px;padding:0 2px}#nsk-admin-bar button{font-size:12px;padding:6px 10px}#nsk-admin-bar .nsk-admin-status{width:100%;text-align:right;font-size:11px}}
#nsk-admin-dialog{position:fixed;inset:0;z-index:100000;background:#0008;display:grid;place-items:center;padding:16px;box-sizing:border-box}
#nsk-admin-dialog>form{background:white;color:#111;padding:22px;border-radius:12px;width:min(90vw,360px);max-width:100%;box-sizing:border-box;font:16px system-ui}
#nsk-admin-dialog input{width:100%;box-sizing:border-box;margin:12px 0;padding:10px}
#nsk-admin-dialog button{margin-right:8px;padding:8px}
`;
document.head.append(css);
let admin=false;
const bar=document.createElement('div');bar.id='nsk-admin-bar';
function mount(){
  // Placera adminraden i sidans normala flöde, före huvudmenyn.
  // Ingen fixed/absolute-positionering som kan täcka sidans knappar.
  const menu=document.querySelector('.mainmenu');
  if(menu&&menu.parentNode){menu.parentNode.insertBefore(bar,menu);return}
  const wrap=document.querySelector('.wrap');
  if(wrap){wrap.insertBefore(bar,wrap.firstChild);return}
  document.body.insertBefore(bar,document.body.firstChild);
}
function render(){
  bar.replaceChildren();
  const button=document.createElement('button');
  button.type='button';
  button.textContent=admin?'Avsluta Adminläge':'Adminläge';
  button.onclick=admin?logout:login;
  bar.append(button);
  if(admin){
    const t=document.createElement('span');t.className='nsk-admin-status';
    t.textContent='Admin aktiv (sparande ännu avstängt)';bar.append(t);
  }
}
async function check(){
  mount();
  const token=localStorage.getItem(KEY);
  if(!token){admin=false;render();return}
  try{
    const r=await fetch(API+'/api/admin/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const d=await r.json();admin=d.admin===true;
    if(!admin)localStorage.removeItem(KEY);
  }catch{admin=false}
  render();
}
async function logout(){
  const token=localStorage.getItem(KEY);
  localStorage.removeItem(KEY);admin=false;render();
  if(token)try{await fetch(API+'/api/admin/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch{alert('Utloggning kunde inte bekräftas. Kontrollera nätverket.')}
}
function login(){
  const overlay=document.createElement('div');overlay.id='nsk-admin-dialog';
  const form=document.createElement('form');
  const heading=document.createElement('strong');heading.textContent='Aktivera Adminläge';
  const input=document.createElement('input');input.type='password';input.autocomplete='current-password';input.required=true;input.placeholder='Administratörslösenord';
  const msg=document.createElement('p');msg.setAttribute('role','status');
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Aktivera';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Avbryt';cancel.onclick=()=>overlay.remove();
  form.append(heading,input,msg,submit,cancel);overlay.append(form);document.body.append(overlay);input.focus();
  form.onsubmit=async e=>{
    e.preventDefault();submit.disabled=true;
    try{
      const r=await fetch(API+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value})});
      const d=await r.json();if(!r.ok||!d.token)throw Error(d.error||'Inloggningen misslyckades');
      localStorage.setItem(KEY,d.token);admin=true;overlay.remove();render();
    }catch(err){msg.textContent=err.message}
    finally{submit.disabled=false;input.value=''}
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();
})();
