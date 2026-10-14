import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../auth-client.js',import.meta.url),'utf8');
assert.match(code,/credentials:'omit'/);
assert.match(code,/\/api\/auth\//);
assert.match(code,/state\.token=null/);
console.log('PASS auth client basic invariants');
