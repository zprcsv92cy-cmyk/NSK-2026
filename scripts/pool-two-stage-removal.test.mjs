import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');const start=source.indexOf('        if(t.dataset.restorePool)'),end=source.indexOf('        const flowLink=',start),code=source.slice(start,end);
for(const removed of [false,true])test(removed?'second removal permanently deletes saved pool':'first removal preserves match data and only archives pool',async()=>{
 const calls=[],pool={id:9,removed},DB={getPool:async()=>pool,deletePool:async()=>calls.push('delete')},window={confirm:()=>true,NSKNavigate:()=>{},NSKCalendarPools:{setSavedPoolRemoved:async(p,r)=>calls.push('archive:'+r),preparePermanentSavedPool:async()=>async()=>calls.push('permanent')}},t={dataset:{deletePool:'9'}};
 const fn=Function('DB','window','sessionStorage','location','return async t=>{'+code+'};')(DB,window,{getItem:()=>null},{href:'/'});await fn(t);
 assert.deepEqual(calls,removed?['delete','permanent']:['archive:true']);assert.equal(t.disabled,false);
});
