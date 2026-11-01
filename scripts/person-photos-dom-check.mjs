// Optional DOM check: install jsdom@26 outside the application, then set NSK_JSDOM_MODULE.
const {JSDOM}=await import(process.env.NSK_JSDOM_MODULE||'jsdom');
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {photoFixture} from './fixtures/person-photos-fixture.mjs';
import {jpeg} from './fixtures/photo-jpeg.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const f=photoFixture();let canEditPhoto=true;
const dom=new JSDOM('<!doctype html><html><head></head><body><div id="playersList"><button data-roster-name="player:101" data-roster-team="18">Testspelare</button><button data-roster-name="coach:201" data-roster-team="18">Testtränare</button><img id="row-player"><img id="row-coach"></div></body></html>',{url:'https://isolated.example.test/truppen/',runScripts:'outside-only'}),w=dom.window;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.APP_CONFIG={API_URL:'https://api.example.test'};w.Auth={getToken:()=> 'synthetic-session',activeTeam:()=> 'NSK Testlag'};w.Blob=Blob;w.AbortSignal=AbortSignal;let urls=0;w.URL.createObjectURL=()=> 'blob:synthetic-'+(++urls);w.URL.revokeObjectURL=()=>{};
w.fetch=async(url,options={})=>{const u=new URL(url);if(u.pathname==='/api/person-card')return Response.json({ok:true,revision:0,name:'Syntetisk person',card:{number:'18',position:'',hand:'',model:'',hollow:'17 mm',profile:'',radius:'',notes:'',goalieEnabled:false,goalie:{model:'',hollow:'17 mm',profile:'',notes:''}},canEditPhoto,canEditProfile:!canEditPhoto,canEditSkates:!canEditPhoto,canRequest:false});return f.handler(new Request(url,options));};
for(const file of ['skate-fields.js','person-photos.js','person-cards.js'])w.eval(fs.readFileSync(root+file,'utf8'));
const wait=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setTimeout(r,0));};
w.PersonPhotos.compress=async()=>jpeg;
for(const [kind,id] of [['player','101'],['coach','201']]){
 const row=w.document.getElementById('row-'+kind);w.PersonPhotos.mount(row,'18',kind,id);w.document.querySelector('[data-roster-name="'+kind+':'+id+'"]').click();await wait();
 assert.equal(w.document.querySelector('.person-card-photo-actions').hidden,false);assert.equal(w.document.getElementById('personCardEdit').hidden,true);assert.equal(w.document.getElementById('personPhotoCameraInput').getAttribute('capture'),'environment');
 const input=w.document.getElementById('personPhotoLibraryInput');Object.defineProperty(input,'files',{value:[new w.File(['synthetic'],'synthetic.jpg',{type:'image/jpeg'})],configurable:true});input.dispatchEvent(new w.Event('change'));await wait();assert.match(row.src,/blob:/);assert.equal(w.document.querySelector('#personCardAvatar img').src,row.src);
 const avatar=w.document.getElementById('personCardAvatar'),viewer=w.document.querySelector('.person-photo-viewer');
 assert.equal(avatar.tagName,'BUTTON');avatar.click();await wait();assert.equal(viewer.open,true);assert.equal(viewer.querySelector('img').src,row.src);assert.equal(viewer.querySelector('h2').textContent,'Syntetisk person');
 viewer.querySelector('button').click();assert.equal(viewer.open,false);assert.equal(w.document.querySelector('.person-card-dialog').open,true);assert.equal(viewer.querySelector('img'),null);
 avatar.click();await wait();viewer.dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(viewer.open,false);
 w.document.getElementById('personPhotoRemove').click();await wait();assert.match(row.src,/icon-192.png$/);assert.match(w.document.querySelector('#personCardAvatar img').src,/icon-192.png$/);w.document.getElementById('personCardClose').click();
}
canEditPhoto=false;w.document.querySelector('[data-roster-name="player:101"]').click();await wait();assert.equal(w.document.querySelector('.person-card-photo-actions').hidden,true);assert.equal(w.document.getElementById('personCardEdit').hidden,false);w.document.getElementById('personCardAvatar').click();await wait();assert.equal(w.document.querySelector('.person-photo-viewer').open,true);assert.match(w.document.querySelector('.person-photo-viewer img').src,/icon-192.png$/);w.dispatchEvent(new w.Event('nsk:session-changed'));assert.equal(w.document.querySelector('.person-photo-viewer').open,false);dom.window.close();console.log('DOM integration passed: player/coach upload, row/card synchronization, removal, camera input and independent permission controls.');
