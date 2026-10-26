import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const script=fs.readFileSync(new URL('../person-cards.js',import.meta.url),'utf8');
function client(respond){
 const calls=[];const context={window:{APP_CONFIG:{API_URL:'https://api.example.test'}},Auth:{getToken:()=> 'personal-token'},document:{getElementById:()=>null},crypto:{randomUUID:()=> 'new-order'},fetch:async(url,options)=>{calls.push({url,options});const {status=200,data}=respond(url,options);return {ok:status<400,status,json:async()=>data};}};
 vm.runInNewContext(fs.readFileSync(new URL('../skate-fields.js',import.meta.url),'utf8')+'\n'+script,context);return {api:context.window.PersonCards,calls};
}
test('card client targets explicit person kind and team with personal credentials and current revision',async()=>{
 const f=client(()=>({data:{ok:true,card:{hollow:'16 mm'},revision:3}}));
 await f.api.get('18','coach','201');await f.api.save('18','coach','201',{hollow:'20 mm'},3);
 assert.match(f.calls[0].url,/kind=coach&person_id=201&team_id=18/);assert.equal(f.calls[0].options.headers.Authorization,'Bearer personal-token');
 assert.deepEqual(JSON.parse(f.calls[1].options.body),{card:{hollow:'20 mm'},revision:3});assert.equal(f.calls[1].options.cache,'no-store');
});
test('sharpening reads a fresh board, preserves checklists and uses linked person identity',async()=>{
 const f=client((url,options)=>({data:options.method==='GET'?{ok:true,revision:7,requests:[],checklists:[{id:'packing'}]}:{ok:true,revision:8}}));
 await f.api.sharpening('18','player','101','Alex');assert.equal(f.calls.length,2);
 const payload=JSON.parse(f.calls[1].options.body);assert.equal(payload.revision,7);assert.equal(payload.requests[0].personId,'101');assert.equal(payload.requests[0].kind,'player');assert.deepEqual(payload.checklists,[{id:'packing'}]);assert.equal(payload.requests[0].skates,undefined);
});
test('duplicate pending slip request is not submitted and server conflicts propagate with status',async()=>{
 const f=client(()=>({data:{ok:true,revision:4,requests:[{kind:'player',personId:'101',done:false}],checklists:[]}}));
 await assert.rejects(f.api.sharpening('18','player','101','Alex'),/redan/);assert.equal(f.calls.length,1);
 const conflict=client(()=>({status:409,data:{ok:false,error:'Ladda om'}}));await assert.rejects(conflict.api.save('18','player','101',{},1),error=>error.status===409&&error.message==='Ladda om');
});
