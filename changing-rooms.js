(() => {
 const hallKey=value=>String(value||'').trim().toLocaleLowerCase('sv-SE').replace(/ishallen/g,'hallen');
 const minutes=value=>/^\d{2}:\d{2}$/.test(value)&&Number(value.slice(0,2))<24&&Number(value.slice(3))<60?Number(value.slice(0,2))*60+Number(value.slice(3)):NaN;
 function match(bookings,date,hall,time){
  const span=String(time||'').match(/^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/);
  if(!span||!(minutes(span[1])<minutes(span[2])))return '';
  const candidates=bookings.filter(b=>b.date===date&&hallKey(b.hall)===hallKey(hall)&&minutes(b.startTime)<=minutes(span[1])&&minutes(b.endTime)>=minutes(span[2]));
  const rooms=[...new Set(candidates.map(b=>b.room))];
  return rooms.length>=1&&rooms.length<=2&&rooms.every(room=>/^\d{1,2}[AB]?$/.test(room))?' Omkl. '+rooms.sort((a,b)=>a.localeCompare(b,'sv-SE',{numeric:true})).join(' och '):'';
 }
 function render(root,data){
  if(!root)return;
  for(const row of root.querySelectorAll('details[data-date]')){
   const hall=row.querySelector('.nsk-pool-hall'),time=row.querySelector('.nsk-training-time');
   if(!hall)continue;
   const original=hall.dataset.roomHall||hall.textContent.trim();hall.dataset.roomHall=original;
   const suffix=match(data.bookings||[],decodeURIComponent(row.dataset.date||''),original,time?.textContent.trim());
   hall.textContent=original+suffix;
   if(suffix)hall.title='Omklädningsrum kontrollerat '+new Date(data.checkedAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm'});
   else hall.removeAttribute('title');
  }
 }
 globalThis.NSKChangingRooms={match,render};
})();
