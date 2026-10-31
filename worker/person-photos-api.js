import {createPersonalRosterIdentityVerifier} from './personal-roster-identity-adapter.js';
import {mapTrustedMembershipsToLegacyTeams} from './production-team-id-map.js';
import {authorizeTeamFeature} from './team-authorization-policy.js';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,data)=>Response.json(data,{status,headers});
const validId=v=>typeof v==='string'&&/^[1-9][0-9]{0,14}$/.test(v)&&Number.isSafeInteger(Number(v));
export const PHOTO_MAX_BYTES=98304;
// Accept only bounded JPEGs. SVG/HTML, remote URLs and unbounded camera originals never enter storage.
export function validPhoto(base64){
 if(typeof base64!=='string'||!base64.length||base64.length>131072||base64.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))return false;
 let b;try{b=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}catch{return false;}
 if(b.length>PHOTO_MAX_BYTES||b.length<16||b[0]!==255||b[1]!==216||b.at(-2)!==255||b.at(-1)!==217)return false;
 let offset=2,dimensions=false;
 while(offset+3<b.length){if(b[offset++]!==255)return false;while(b[offset]===255)offset++;const marker=b[offset++];if(marker===218)return dimensions;if(marker===217)return false;const length=(b[offset]<<8)|b[offset+1];if(length<2||offset+length>b.length)return false;
  if([192,193,194].includes(marker)){if(length<8)return false;const height=(b[offset+3]<<8)|b[offset+4],width=(b[offset+5]<<8)|b[offset+6];if(!width||!height||width>512||height>512)return false;dimensions=true;}
  offset+=length;
 }
 return false;
}
async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw {status:400,error:'Tom begäran'};const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>140000){await reader.cancel();throw {status:413,error:'Bilden är för stor'};}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw {status:400,error:'Ogiltig bilddata'};}
}
export function createPersonPhotosHandler(env,listTeams,{verifyIdentity=createPersonalRosterIdentityVerifier(env),readPerson}={}){
 return async request=>{
  const url=new URL(request.url),manifest=url.pathname==='/api/person-photos';
  if(!manifest&&url.pathname!=='/api/person-photo')return reply(404,{ok:false,error:'Okänd adress'});
  if(!(manifest?['GET']:['GET','PUT']).includes(request.method))return reply(405,{ok:false,error:'Otillåten metod'});
  const teams=url.searchParams.getAll('team_id'),kinds=url.searchParams.getAll('kind'),ids=url.searchParams.getAll('person_id');
  if(teams.length!==1||!validId(teams[0])||!manifest&&(kinds.length!==1||!['player','coach'].includes(kinds[0])||ids.length!==1||!validId(ids[0])))return reply(400,{ok:false,error:'Ogiltigt lag eller person'});
  const token=/^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization')||'')?.[1];if(!token)return reply(401,{ok:false,error:'Logga in först'});
  try{
   const actor=await verifyIdentity(token);if(!actor)return reply(401,{ok:false,error:'Logga in igen'});
   const access=mapTrustedMembershipsToLegacyTeams(actor,await listTeams());
   if(!access.memberships.some(m=>m.team_id===teams[0])||!access.permissions.includes('read'))return reply(403,{ok:false,error:'Ingen åtkomst till laget'});
   const canEdit=actor.is_primary_admin===true||authorizeTeamFeature(access,teams[0],'photos').allowed;
   if(request.method==='PUT'&&!canEdit)return reply(403,{ok:false,error:'Saknar behörighet att ändra profilbild'});
   const db=env.AUTH_DB;
   if(manifest){const rows=await db.prepare('SELECT kind,person_id,revision,photo IS NOT NULL AS has_photo FROM person_photos WHERE team_id=?').bind(teams[0]).all();return reply(200,{ok:true,photos:rows.results.map(r=>({kind:r.kind,personId:r.person_id,revision:r.revision,hasPhoto:!!r.has_photo}))});}
   if(typeof readPerson!=='function')return reply(503,{ok:false,error:'Truppkopplingen saknas'});
   if(!await readPerson(teams[0],kinds[0],ids[0]))return reply(404,{ok:false,error:'Personen finns inte i valt lag'});
   const key=[teams[0],kinds[0],ids[0]];
   const row=await db.prepare('SELECT photo,revision FROM person_photos WHERE team_id=? AND kind=? AND person_id=?').bind(...key).first();
   if(request.method==='GET')return reply(200,{ok:true,photo:row?.photo||null,revision:row?.revision||0,canEdit});
   const data=await readBody(request);
   if(!data||Array.isArray(data)||Object.keys(data).some(k=>!['photo','revision'].includes(k))||!Number.isSafeInteger(data.revision)||data.revision<0||!(data.photo===null||validPhoto(data.photo)))return reply(400,{ok:false,error:'Välj en JPEG-bild på högst 512 × 512 bildpunkter'});
   if(data.revision!==(row?.revision||0))return reply(409,{ok:false,error:'Bilden har ändrats av någon annan. Läs om kortet.'});
   // Tombstones retain a monotonic revision so a stale client cannot restore a removed image.
   const result=row?await db.prepare('UPDATE person_photos SET photo=?,revision=revision+1 WHERE team_id=? AND kind=? AND person_id=? AND revision=?').bind(data.photo,...key,data.revision).run():await db.prepare('INSERT INTO person_photos (team_id,kind,person_id,photo,revision) VALUES (?,?,?,?,1) ON CONFLICT DO NOTHING').bind(...key,data.photo).run();
   if(result.meta?.changes!==1)return reply(409,{ok:false,error:'Bilden har ändrats av någon annan. Läs om kortet.'});
   return reply(200,{ok:true,revision:data.revision+1,hasPhoto:data.photo!==null});
  }catch(error){return reply(error.status||503,{ok:false,error:error.error||'Profilbilder kunde inte hämtas eller sparas. Försök igen.'});}
 };
}
