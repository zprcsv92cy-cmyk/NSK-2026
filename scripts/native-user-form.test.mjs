import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const entry=readFileSync(new URL('../shell-entry.js',import.meta.url),'utf8');
const shell=readFileSync(new URL('../app-shell.js',import.meta.url),'utf8');
test('direct user form remains a native document without shell redirect',()=>{
 const window={};window.parent=window;
 const document={currentScript:{src:'https://example.test/site/shell-entry.js'},documentElement:{dataset:{}}};
 const location={pathname:'/site/anvandare/',replace(){throw Error('Unexpected iframe redirect');}};
 vm.runInNewContext(entry,{window,document,location,URL});
 assert.equal(document.documentElement.dataset.nskNativeForm,'true');
});
test('shell users navigation opens top-level form before iframe state is changed',async()=>{
 let destination;
 const context={signedOut:false,route:()=>({slug:'anvandare',url:new URL('https://example.test/site/anvandare/')}),location:{assign:url=>destination=url}};
 const start=shell.indexOf(' async function navigate('),end=shell.indexOf('  const reset=',start);
 vm.runInNewContext(shell.slice(start,end)+'} this.navigate=navigate;',context);
 await context.navigate('anvandare');
 assert.equal(destination,'https://example.test/site/anvandare/');
});
