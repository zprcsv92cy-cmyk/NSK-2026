import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {photoFixture,photoRequest} from './fixtures/person-photos-fixture.mjs';
import {jpeg} from './fixtures/photo-jpeg.mjs';
const code=fs.readFileSync(new URL('../person-photos.js',import.meta.url),'utf8');
function client(f){
 let currentToken='test-user',poll;const calls=[],revoked=[],canvasCalls=[],listeners=new Map();let next=0;
 const events={addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:event=>listeners.get(event.type)?.(event)};
 class FakeURL extends URL{static createObjectURL(){return 'blob:test-'+(++next);}static revokeObjectURL(url){revoked.push(url);}}
 class Image{naturalWidth=2000;naturalHeight=1000;async decode(){}}
 const document={hidden:false,addEventListener:events.addEventListener,createElement(tag){assert.equal(tag,'canvas');return {getContext:()=>({fillRect(){},drawImage(...args){canvasCalls.push(args.slice(1));}}),toDataURL:()=> 'data:image/jpeg;base64,'+jpeg};}};
 const window={...events,Auth:{getToken:()=>currentToken},APP_CONFIG:{API_URL:'https://api.example.test'}};
 const context={window,document,Image,URL:FakeURL,Blob,Uint8Array,atob,AbortSignal,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},setInterval:fn=>{poll=fn;},fetch:async(url,options)=>{calls.push({url,options});return f.handler(new Request(url,options));}};vm.runInNewContext(code,context);
 const image=()=>{const attributes=new Map(),classes=new Set();return {dataset:{},isConnected:true,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},getAttribute:key=>attributes.get(key)||null,set src(value){attributes.set('src',value);},get src(){return attributes.get('src');}};};
 return {api:window.PersonPhotos,image,calls,revoked,canvasCalls,changeToken:t=>{currentToken=t;events.dispatchEvent({type:'nsk:session-changed'});},poll:()=>poll(),document};
}
test('card and roster share a private blob; another user sees replacements and removal after refresh',async()=>{
 const f=photoFixture(),a=client(f),b=client(f),card=a.image(),row=a.image(),other=b.image();a.api.mount(card,'18','player','101');a.api.mount(row,'18','player','101');b.api.mount(other,'18','player','101');await a.api.refresh('18',true);await b.api.refresh('18',true);assert.equal(card.src,'../icon-192.png');
 await a.api.save('18','player','101',jpeg,0);await b.api.refresh('18',true);assert.match(card.src,/^blob:/);assert.equal(card.src,row.src);assert.match(other.src,/^blob:/);assert.ok(card.classList.contains('has-profile-photo'));const old=other.src;
 await a.api.save('18','player','101',jpeg,1);await b.api.refresh('18',true);assert.notEqual(other.src,old);assert.ok(b.revoked.includes(old));
 await a.api.save('18','player','101',null,2);await b.api.refresh('18',true);for(const image of [card,row,other])assert.equal(image.src,'../icon-192.png');assert.ok(a.calls.every(c=>c.options.headers.Authorization==='Bearer test-user'&&c.options.cache==='no-store'));
});
test('logout revokes image URLs, restores logo immediately and sends no anonymous photo request',async()=>{
 const f=photoFixture();await f.handler(photoRequest('PUT',{photo:jpeg,revision:0}));const a=client(f),image=a.image();a.api.mount(image,'18','player','101');await a.api.refresh('18',true);const url=image.src;a.changeToken(null);assert.equal(image.src,'../icon-192.png');assert.ok(a.revoked.includes(url));const count=a.calls.length;a.poll();assert.equal(a.calls.length,count);
});
test('image errors fall back to the crest without an infinite error loop',async()=>{
 const a=client(photoFixture()),image=a.image();a.api.mount(image,'18','player','101');image.src='blob:missing';image.onerror();assert.equal(image.src,'../icon-192.png');image.onerror();assert.equal(image.src,'../icon-192.png');
});
test('camera/library image is center-cropped and encoded to a bounded JPEG; oversized input is refused',async()=>{
 const a=client(photoFixture());assert.equal(await a.api.compress({type:'image/png',size:1000}),jpeg);assert.deepEqual(a.canvasCalls[0],[500,0,1000,1000,0,0,384,384]);await assert.rejects(a.api.compress({type:'image/jpeg',size:30*1024*1024}),/25 MB/);await assert.rejects(a.api.compress({type:'text/html',size:10}),/Välj en bild/);
});
test('photo editor provides separate iPhone camera/library inputs and only photo managers see the controls',()=>{
 const cards=fs.readFileSync(new URL('../person-cards.js',import.meta.url),'utf8');assert.match(cards,/id="personPhotoCameraInput" accept="image\/\*" capture="environment"/);assert.match(cards,/id="personPhotoLibraryInput" accept="image\/\*" hidden/);assert.match(cards,/photoActions.hidden=!current\?\.canEditPhoto/);assert.match(cards,/PersonPhotos\?\.mount/);assert.match(fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),/class="person-profile-photo" src="\.\.\/icon-192.png"/);
});

test('a delayed pre-upload manifest cannot replace a confirmed new photo with the logo',async()=>{
 const f=photoFixture(),handler=f.handler;let release,first=true;f.handler=async request=>{const response=await handler(request);if(new URL(request.url).pathname==='/api/person-photos'&&first){first=false;await new Promise(resolve=>release=resolve);}return response;};
 const a=client(f),image=a.image();a.api.mount(image,'18','player','101');await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function');await a.api.save('18','player','101',jpeg,0);const confirmed=image.src;assert.match(confirmed,/blob:/);release();await a.api.refresh('18',true);assert.equal(image.src,confirmed);
});
