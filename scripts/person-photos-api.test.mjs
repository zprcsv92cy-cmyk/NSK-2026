import test from 'node:test';
import assert from 'node:assert/strict';
import {photoFixture,photoRequest as req} from './fixtures/person-photos-fixture.mjs';
import {jpeg} from './fixtures/photo-jpeg.mjs';
import {validPhoto} from '../worker/person-photos-api.js';
test('private photos reject anonymous/invalid sessions and unrelated teams before reading storage',async()=>{
 const f=photoFixture();for(const token of [null,'invalid'])assert.equal((await f.handler(req('GET',undefined,{token}))).status,401);assert.equal((await f.handler(req('GET',undefined,{team:'19'}))).status,403);assert.equal(f.reads(),0);
});
test('only explicit photo permission permits image changes; read-only and equipment-only sessions cannot write',async()=>{
 const f=photoFixture();f.setRole('viewer');assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0}))).status,403);f.setRole('equipment');f.setPermissions(['read']);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0}))).status,403);assert.equal(f.reads(),0);assert.equal((await f.handler(req())).status,200);
});
test('upload, replace, read from another user and remove share a monotonic revision and preserve other people',async()=>{
 const f=photoFixture();assert.deepEqual(await (await f.handler(req())).json(),{ok:true,photo:null,revision:0,canEdit:true});
 for(const [id,kind] of [['101','player'],['201','coach']])assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0},{id,kind}))).status,200);
 const other=await (await f.handler(req('GET',undefined,{token:'another-user'}))).json();assert.equal(other.photo,jpeg);assert.equal(other.revision,1);
 assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:1}))).status,200);assert.equal((await f.handler(req('PUT',{photo:null,revision:2}))).status,200);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:1}))).status,409);
 assert.equal((await (await f.handler(req())).json()).photo,null);const manifest=await (await f.handler(req('GET',undefined,{manifest:true}))).json();assert.equal(manifest.photos.length,2);assert.equal(manifest.photos.find(p=>p.kind==='coach').hasPhoto,true);assert.equal(manifest.photos.find(p=>p.kind==='player').revision,3);assert.ok(manifest.photos.every(p=>!Object.hasOwn(p,'photo')));
});
test('simultaneous writers cannot overwrite each other',async()=>{
 const f=photoFixture(),results=await Promise.all([f.handler(req('PUT',{photo:jpeg,revision:0})),f.handler(req('PUT',{photo:null,revision:0}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
test('image validation rejects SVG, URLs, excessive dimensions, body size, unknown fields and foreign people',async()=>{
 assert.equal(validPhoto(jpeg),true);for(const bad of ['https://example.test/image.jpg',btoa('<svg/>'),'a'.repeat(140000),'not-base64'])assert.equal(validPhoto(bad),false);
 const bytes=Buffer.from(jpeg,'base64');const sof=bytes.indexOf(Buffer.from([255,192]));bytes[sof+7]=3;bytes[sof+8]=0;assert.equal(validPhoto(bytes.toString('base64')),false);
 const f=photoFixture();for(const photo of ['<svg/>','https://example.test/a'])assert.equal((await f.handler(req('PUT',{photo,revision:0}))).status,400);assert.equal((await f.handler(req('PUT',{photo:'x'.repeat(145000),revision:0}))).status,413);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0,role:'owner'}))).status,400);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0},{id:'999'}))).status,404);
 const response=await f.handler(req());assert.match(response.headers.get('cache-control'),/private, no-store/);
});

test('photo permission is independent from roster management',async()=>{
 const f=photoFixture();f.setPermissions(['read','roster:manage']);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0}))).status,403);f.setPermissions(['read','photos:manage']);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0}))).status,200);
});

test('the server-verified primary administrator can change pictures without a delegated grant',async()=>{
 const f=photoFixture();f.setPermissions([]);f.setRole('viewer');f.setPrimary(true);assert.equal((await f.handler(req('PUT',{photo:jpeg,revision:0}))).status,200);
});
