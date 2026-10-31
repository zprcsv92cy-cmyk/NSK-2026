import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {createPersonPhotosHandler} from '../../worker/person-photos-api.js';
export function photoFixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../../migrations/20261031_person_photos.sql',import.meta.url),'utf8'));let role='coach',permissions=['read','photos:manage'],reads=0,primary=false;
 const db={prepare(sql){let args=[];const statement={bind(...values){args=values;return statement;},async first(){reads++;return sqlite.prepare(sql).get(...args)||null;},async all(){reads++;return {results:sqlite.prepare(sql).all(...args)};},async run(){const result=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};return statement;}};
 const handler=createPersonPhotosHandler({AUTH_DB:db},async()=>[{id:18,Namn:'NSK Testlag',Säsong:'2026'}],{verifyIdentity:async token=>token==='invalid'?null:{user:{id:token},is_primary_admin:primary,is_global_admin:primary,memberships:[{team_id:'NSK Testlag',role}],permissions},readPerson:async(team,kind,id)=>team==='18'&&(['101','102'].includes(id)&&kind==='player'||id==='201'&&kind==='coach')?{name:'Syntetisk person'}:null});
 return {handler,sqlite,setRole:value=>role=value,setPermissions:value=>permissions=value,reads:()=>reads,setPrimary:value=>primary=value};
}
export const photoRequest=(method='GET',data,{team='18',kind='player',id='101',token='test-user',manifest=false}={})=>new Request('https://api.example.test/api/'+(manifest?'person-photos':'person-photo?kind='+kind+'&person_id='+id)+(manifest?'?':'&')+'team_id='+team,{method,headers:token?{Authorization:'Bearer '+token}:undefined,...(data===undefined?{}:{body:JSON.stringify(data)})});
