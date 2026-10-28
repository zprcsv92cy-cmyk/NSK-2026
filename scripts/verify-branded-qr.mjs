// Executed by CI with isolated, pinned decoder dependencies; uses synthetic links only.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(process.env.NSK_QR_CHECK_DIR+'/package.json');
const jsQR=require('jsqr'),{Resvg}=require('@resvg/resvg-js');
const head={append(){}};
const document={head,createElement:()=>({})};
const window={};
const context={window,document};
vm.createContext(context);
vm.runInContext(readFileSync('qr-code.js','utf8'),context);
window.qrcode=context.qrcode;
vm.runInContext(readFileSync('sharpening-link-manager.js','utf8'),context);
let checked=0;
for(const origin of ['https://nsk18.pages.dev','https://zprcsv92cy-cmyk.github.io/NSK-2026']){
 for(let sample=0;sample<12;sample++){
  const token=createHash('sha256').update('qr-art-fixture-'+sample).digest('hex');
  const url=origin+'/slipning/#nyckel='+token;
  const data=window.SharpeningLinks.brandedQrDataUrl(url);
  const svg=decodeURIComponent(data.slice(data.indexOf(',')+1));
  assert.match(svg,/<image .*xlink:href="data:image\/png;base64,/);
  assert.ok(svg.indexOf('<image ')<svg.indexOf('<rect x='),'Skate is behind the QR sampling centres');
  assert.doesNotMatch(svg,/opacity=/,'Keep the skate image fully visible');
  assert.match(svg,/<rect x="[^\"]+" y="[^\"]+" width="0\.65" height="0\.65"/,'Use square data sampling centres');
  assert.ok(svg.includes(readFileSync('slipning/icon-192.png').toString('base64')),'Use the personal sharpening skate icon');
  assert.ok(!svg.includes(url),'URL should be encoded as QR modules only');
  for(const size of [190,380,400,570,650]){
   const image=new Resvg(svg,{fitTo:{mode:'width',value:size}}).render();
   const result=jsQR(new Uint8ClampedArray(image.pixels),image.width,image.height);
   assert.equal(result?.data,url,'Logo QR must decode at '+size+'px, sample '+sample);
   checked++;
   if(size===650){
    const gray=new Uint8ClampedArray(image.pixels);
    for(let i=0;i<gray.length;i+=4){const value=Math.round(gray[i]*.299+gray[i+1]*.587+gray[i+2]*.114);gray[i]=gray[i+1]=gray[i+2]=value;}
    assert.equal(jsQR(gray,image.width,image.height)?.data,url,'Printed grayscale QR must decode');
    checked++;
   }
  }
 }
}
console.log(checked+' branded QR images decoded to their original synthetic links.');
