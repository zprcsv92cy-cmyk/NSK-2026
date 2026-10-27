// Portable copies of the user's local exercise files. No network requests.
(() => {
 const limit=50*1024*1024;
 async function encode(records){
  if(records.length>500||records.reduce((sum,r)=>sum+r.blob.size,0)>limit)throw Error('Säkerhetskopian får vara högst 50 MB och 500 filer.');
  const files=[];
  for(const record of records){const bytes=new Uint8Array(await record.blob.arrayBuffer());let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));files.push({title:record.title,description:record.description||'',category:record.category,filename:record.filename,type:record.blob.type,data:btoa(binary)});}
  return {format:'nsk-exercise-backup',version:1,files};
 }
 function decode(data){
  if(data?.format!=='nsk-exercise-backup'||data.version!==1||!Array.isArray(data.files)||data.files.length>500)throw Error('Ogiltig säkerhetskopia.');
  const records=[];let total=0;
  for(const file of data.files){
   if(!file||typeof file.title!=='string'||!file.title.trim()||file.title.length>100||typeof file.description!=='string'||file.description.length>800||typeof file.category!=='string'||file.category.length>100||typeof file.filename!=='string'||file.filename.length>255||!/\.(pdf|doc|docx|txt|svg|png|jpe?g|webp)$/i.test(file.filename)||typeof file.type!=='string'||file.type.length>150||typeof file.data!=='string'||file.data.length>22*1024*1024||(file.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)))throw Error('Säkerhetskopian innehåller en ogiltig fil.');
   const binary=atob(file.data);total+=binary.length;if(binary.length>15*1024*1024||total>limit)throw Error('Säkerhetskopian är för stor.');
   records.push({id:crypto.randomUUID(),title:file.title.trim(),description:file.description,category:file.category,filename:file.filename,blob:new Blob([Uint8Array.from(binary,c=>c.charCodeAt(0))],{type:file.type}),created:Date.now()});
  }
  return records;
 }
 window.NSKExerciseBackup={encode,decode};
})();
