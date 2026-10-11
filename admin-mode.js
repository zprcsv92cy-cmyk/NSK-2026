(()=>{
const API='https://nsk-api.peter-hasselberg.workers.dev';
const KEY='nsk_admin_token';
const css=document.createElement('style');
css.textContent=`
#nsk-admin-bar{position:static!important;inset:auto!important;float:none!important;z-index:auto!important;display:flex;align-items:center;justify-content:flex-end;box-sizing:border-box;width:100%;max-width:100%;margin:3px 0 7px;padding:0;background:transparent!important;border:0!important;box-shadow:none!important;font:11px system-ui,sans-serif;color:inherit}
#nsk-admin-bar button{appearance:none;font:inherit;font-weight:500;line-height:1.15;padding:4px 8px;min-height:25px;cursor:pointer;border:1px solid #64748b;border-radius:5px;background:#263445;color:#e2e8f0;box-shadow:none;white-space:nowrap;width:auto;min-width:0;max-width:100%}
#nsk-admin-bar button.nsk-admin-active{border-color:#3b8168;background:#1c3c34;color:#d7fbe8}
#nsk-admin-bar button:focus-visible{outline:2px solid #93c5fd;outline-offset:2px}
@media(max-width:600px){#nsk-admin-bar{margin:3px 0 6px;padding:0 2px}#nsk-admin-bar button{font-size:10px;padding:4px 7px;min-height:24px}}
#nsk-admin-dialog{position:fixed;inset:0;z-index:100000;background:#0008;display:grid;place-items:center;padding:16px;box-sizing:border-box}
#nsk-admin-dialog>form{background:white;color:#111;padding:22px;border-radius:12px;width:min(90vw,360px);max-width:100%;box-sizing:border-box;font:16px system-ui}
#nsk-admin-dialog input{width:100%;box-sizing:border-box;margin:12px 0;padding:10px}
#nsk-admin-dialog button{margin-right:8px;padding:8px}
`;
document.head.append(css);
let admin=false;
const bar=document.createElement('div');bar.id='nsk-admin-bar';
function mount(){
  // Placera adminraden i sidans normala flöde, direkt efter huvudmenyn.
  const menu=document.querySelector('.mainmenu');
  if(menu&&menu.parentNode){menu.insertAdjacentElement('afterend',bar);return}
  const wrap=document.querySelector('.wrap');
  if(wrap){wrap.insertBefore(bar,wrap.firstChild);return}
  document.body.insertBefore(bar,document.body.firstChild);
}
function render(){
  bar.replaceChildren();
  const button=document.createElement('button');
  button.type='button';
  button.textContent=admin?'Admin: på':'Admin';
  button.className=admin?'nsk-admin-active':'';
  button.title=admin?'Avsluta adminläge':'Aktivera adminläge';
  button.setAttribute('aria-label',button.title);
  button.onclick=admin?logout:login;
  bar.append(button);
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
