// Explicit schedule editing; all saved pool metadata uses the existing shared match API.
(()=>{
 const root=new URL('./',document.currentScript.src),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let dialog,opening=false;
 document.addEventListener('click',async event=>{
  const trigger=event.target.closest?.('[data-edit-match-schedule],[data-edit-calendar-schedule]');if(!trigger)return;
  if(opening||dialog?.open)return;opening=true;event.preventDefault();event.stopPropagation();trigger.disabled=true;
  dialog?.remove();dialog=document.createElement('dialog');dialog.className='nsk-schedule-editor';
  dialog.innerHTML='<h2>Redigera matcher</h2><p role="status">Hämtar matchuppgifter…</p><button type="button" data-loading-cancel>Avbryt</button>';
  document.body.append(dialog);const activeDialog=dialog;dialog.querySelector('[data-loading-cancel]').onclick=()=>activeDialog.close();dialog.showModal();
  try{
   const modelApi=await import(new URL('pool-schedule-model.mjs?v='+encodeURIComponent(window.NSK_VERSION||'1'),root));
   let model,imported=trigger._calendarSchedule;
   if(imported){model={imported,rows:imported.matches.map((r,i)=>({start_time:r.startTime||'',opponent:r.opponent||'',ownTeam:r.ownTeam||'',lag_no:1,match_no:i+1})),count:imported.matches.length||1};}
   else{
    const [pool,configs]=await Promise.all([DB.getPool(trigger.dataset.editMatchSchedule),DB.listPoolTeamMatchConfigs(trigger.dataset.editMatchSchedule)]);if(!pool)throw Error('Poolspelet kunde inte läsas.');if(pool.active===false||pool.removed)throw Error('Återöppna poolspelet före redigering.');
    const bases=new Map();model={pool,configs,bases,rows:configs.map(r=>({...r,start_time:String(r.start_time||'').slice(0,5)})),count:Number(pool.matches)||1};
   }
   if(!activeDialog.open)return;
   let preparationError;const prepared=model.pool?Promise.all([Promise.all(model.configs.map(async r=>model.bases.set(r.lag_no+':'+r.match_no,await DB.lineupBase(r,await DB.getLineup(r.id))))),window.NSKCalendarPools.getSavedScheduleSources(model.pool).then(sources=>model.sources=sources)]).catch(error=>{preparationError=error;}):Promise.resolve();
   dialog.innerHTML='<form><h2>Redigera matcher</h2><label>'+(imported?'Antal matcher':'Antal matcher per lag')+'<select data-count>'+Array.from({length:imported?16:8},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'</option>').join('')+'</select></label><div data-rows></div><p class="small">Manuella ändringar behålls vid import. Uppställningar och byten behålls om antalet matcher minskas.</p><p data-status role="status"></p><div class="nsk-schedule-actions"><button type="button" data-cancel>Avbryt</button><button type="submit">Spara</button></div></form>';
   const form=dialog.querySelector('form'),count=dialog.querySelector('[data-count]'),list=dialog.querySelector('[data-rows]'),status=dialog.querySelector('[data-status]');count.value=String(model.count);
   const capture=()=>{for(const row of list.querySelectorAll('[data-slot]')){const key=row.dataset.slot,found=model.rows.find(r=>r.lag_no+':'+r.match_no===key);if(found){found.start_time=row.querySelector('[type="time"]').value;found.opponent=row.querySelector('[data-opponent]').value;}}};
   const render=()=>{capture();const n=Number(count.value),teams=imported?1:Number(model.pool.teams)||1;const chosen=[];for(let lag=1;lag<=teams;lag++){for(let match=1;match<=n;match++){let row=model.rows.find(r=>r.lag_no===lag&&r.match_no===match);if(!row){row={lag_no:lag,match_no:match,start_time:'',opponent:''};model.rows.push(row);}chosen.push(row);}}
    list.innerHTML=chosen.map(r=>'<fieldset data-slot="'+r.lag_no+':'+r.match_no+'"><legend>'+(teams>1?'Lag '+r.lag_no+' · ':'')+'Match '+r.match_no+'</legend><label>Starttid<input type="time" value="'+esc(r.start_time)+'"></label><label>Motståndare<input data-opponent maxlength="150" required value="'+esc(r.opponent)+'"></label></fieldset>').join('');};render();count.onchange=render;
   let saving=false;dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();});
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();form.onsubmit=async e=>{e.preventDefault();capture();const n=Number(count.value),rows=model.rows.filter(r=>r.match_no<=n&&(imported?r.lag_no===1:r.lag_no<=Number(model.pool.teams)));let save=form.querySelector('[type="submit"]');saving=true;form.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);status.textContent='Sparar matcherna…';
    try{modelApi.validateScheduleRows(rows);await prepared;if(preparationError)throw preparationError;if(imported)await window.NSKCalendarPools.saveImportedSchedule(imported,rows.map(r=>({startTime:r.start_time,opponent:r.opponent,ownTeam:r.ownTeam||''})));
     else await modelApi.saveSavedSchedule(DB,model,rows,n,{lock:pool=>window.NSKCalendarPools.lockSchedule(pool),mirror:(pool,matches)=>window.NSKCalendarPools.saveSavedScheduleSources(pool,matches,model.sources)});
     dialog.close();(window.NSKNavigate?window.NSKNavigate(location.href,{reload:true,replace:true}):location.reload());
    }catch(error){status.textContent=error.message||'Matchschemat kunde inte sparas. Dina ändringar finns kvar.';}finally{saving=false;form.querySelectorAll('button,input,select').forEach(control=>control.disabled=false);}
   };dialog.scrollTop=0;
  }catch(error){if(activeDialog.open){activeDialog.querySelector('[role=status]').textContent=error.message||'Redigeringen kunde inte öppnas.';}}finally{trigger.disabled=false;opening=false;}
 });
})();
