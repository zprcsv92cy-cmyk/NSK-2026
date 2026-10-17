// Inventory of legacy API calls. Read-only static analysis; does not contact production.
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../db.js',import.meta.url),'utf8');
const patterns=[
 ['Unprotected legacy reads',/fetch\(\x60\$\{API\}\/api\/\$\{table\}/g],
 ['Legacy direct requests',/fetch\(\x60\$\{API\}/g],
 ['Legacy admin token',/nsk_admin_token/g],
 ['Legacy match token',/nsk_match_token/g]
];
for(const [label,re] of patterns){
 const count=[...source.matchAll(re)].length;
 console.log(label+': '+count);
}
if(!source.includes('window.DB'))throw Error('Existing data adapter not found');
console.log('AUDIT ONLY: Direct legacy API calls must be protected server-side before production. This check does not certify production readiness.');
