(()=>{
const API='https://nsk-api.peter-hasselberg.workers.dev';
const KEY='nsk_admin_token';
// Only the fully coordinated release may replace the shared Adminläge control.
// Existing production keeps its original login until all client flags are enabled.
const personalCutoverEnabled = ['POOL_WRITES','MATCH_WRITES','ROSTER_WRITES','COACH_SELECTION']
  .every(name => window.APP_CONFIG?.['REQUIRE_PERSONAL_' + name] === true);
if (personalCutoverEnabled) {
  // Stale shared credentials must not linger in the browser after personal cutover.
  try { localStorage.removeItem(KEY); localStorage.removeItem('nsk_match_token'); } catch { /* Storage can be disabled */ }
  const addAccountLink = () => {
    const menu = document.querySelector('.mainmenu');
    if (!menu || menu.querySelector('a[href="../mittkonto/"]')) return;
    const link = document.createElement('a');
    link.href = '../mittkonto/';
    link.textContent = 'Mitt konto';
    menu.append(link);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addAccountLink);
  else addAccountLink();
  return;
}
const css=document.createElement('style');
css.textContent=`
#nsk-admin-bar{position:static!important;display:flex;justify-content:flex-end;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin:5px 0 2px!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;color:#c8d0d8;font:12px system-ui,sans-serif;z-index:auto!important}
#nsk-admin-bar button{font:inherit!important;font-size:11px!important;line-height:1.15!important;padding:5px 8px!important;min-height:0!important;min-width:0!important;width:auto!important;border:1px solid #53606b!important;border-radius:6px!important;background:#303943!important;color:#e8eef3!important;box-shadow:none!important;cursor:pointer}
#nsk-admin-bar .nsk-admin-indicator{width:6px;height:6px;flex:none;border-radius:50%;background:#48bb78}
#nsk-admin-dialog{position:fixed;inset:0;z-index:100000;background:#0008;display:grid;place-items:center}
#nsk-admin-dialog>form{background:white;color:#111;padding:22px;border-radius:12px;width:min(90vw,360px);font:16px system-ui}
#nsk-admin-dialog input{width:100%;box-sizing:border-box;margin:12px 0;padding:10px}
#nsk-admin-dialog button{margin-right:8px;padding:8px}
@media(max-width:700px){#nsk-admin-bar{margin:4px 0 0!important}#nsk-admin-bar button{font-size:10px!important;padding:4px 7px!important}}
`;
document.head.append(css);
let admin=false;
const bar=document.createElement('div');bar.id='nsk-admin-bar';
function mount(){
  const menu=document.querySelector('.mainmenu');
  if(menu){menu.insertAdjacentElement('afterend',bar);return;}
  const wrap=document.querySelector('.wrap');
  if(wrap)wrap.insertAdjacentElement('afterbegin',bar);
  else document.body.insertAdjacentElement('afterbegin',bar);
}
async function check(){const token=localStorage.getItem(KEY);if(!token){admin=false;render();return}try{const r=await fetch(API+'/api/admin/status',{headers:{Authorization:'Bearer '+token},cache:'no-store'});const d=await r.json();admin=d.admin===true;if(!admin)localStorage.removeItem(KEY)}catch{admin=false}render()}
function render(){bar.replaceChildren();const button=document.createElement('button');button.type='button';button.textContent=admin?'Avsluta admin':'Adminläge';button.onclick=admin?logout:login;bar.append(button);if(admin){const dot=document.createElement('span');dot.className='nsk-admin-indicator';dot.title='Admin aktiv';bar.append(dot)}}
async function logout(){const token=localStorage.getItem(KEY);localStorage.removeItem(KEY);admin=false;render();if(token)try{await fetch(API+'/api/admin/logout',{method:'POST',headers:{Authorization:'Bearer '+token}})}catch{alert('Utloggning kunde inte bekräftas. Kontrollera nätverket.')}}
function login(){const overlay=document.createElement('div');overlay.id='nsk-admin-dialog';const form=document.createElement('form');const heading=document.createElement('strong');heading.textContent='Aktivera Adminläge';const input=document.createElement('input');input.type='password';input.autocomplete='current-password';input.required=true;input.placeholder='Administratörslösenord';const msg=document.createElement('p');msg.setAttribute('role','status');const submit=document.createElement('button');submit.type='submit';submit.textContent='Aktivera';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Avbryt';cancel.onclick=()=>overlay.remove();form.append(heading,input,msg,submit,cancel);overlay.append(form);document.body.append(overlay);input.focus();form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const r=await fetch(API+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.value})});const d=await r.json();if(!r.ok||!d.token)throw Error(d.error||'Inloggningen misslyckades');localStorage.setItem(KEY,d.token);admin=true;overlay.remove();render()}catch(err){msg.textContent=err.message}finally{submit.disabled=false;input.value=''}}}
function start(){mount();check()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
