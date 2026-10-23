export function trainingSessionKey(team,date){if(!team||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Invalid training date');return [String(team),date];}
export function validateTrainingPayload(data){
 if(!data||typeof data!=='object'||Array.isArray(data))return false;
 const keys=['selected','selectedCoaches','goalies','goalieCount','allocation','shirtColorCount','hall','revision'];
 if(Object.keys(data).some(k=>!keys.includes(k)))return false;
 const ids=a=>Array.isArray(a)&&a.length<=200&&a.every(x=>typeof x==='string'&&/^[1-9][0-9]*$/.test(x))&&new Set(a).size===a.length;
 return ids(data.selected)&&ids(data.selectedCoaches)&&ids(data.goalies)&&data.goalies.every(id=>data.selected.includes(id))&&
 Number.isInteger(data.goalieCount)&&data.goalieCount>=0&&data.goalieCount<=2&&data.goalies.length===data.goalieCount&&
 (!('shirtColorCount' in data)||[2,3,4].includes(data.shirtColorCount))&&(!('hall' in data)||['','Lilla Hallen','Stora hallen'].includes(data.hall))&&Number.isInteger(data.revision)&&data.revision>=0&&Array.isArray(data.allocation)&&data.allocation.length<=4&&data.allocation.every(group=>ids(group)&&group.every(id=>data.selected.includes(id)&&!data.goalies.includes(id)))&&new Set(data.allocation.flat()).size===data.allocation.flat().length;
}
