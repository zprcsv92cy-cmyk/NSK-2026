import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../worker/production-api-v42-reference.js',import.meta.url),'utf8');
test('shared training is disabled by default and handles PUT and POST preflight',()=>{
 assert.match(source,/NSK_ENABLE_SHARED_TRAINING !== "true"/);
 assert.match(source,/req.method === "OPTIONS"/);
 assert.match(source,/"GET,PUT,POST,OPTIONS"/);
 assert.match(source,/createTrainingHandler\(env/);
});
