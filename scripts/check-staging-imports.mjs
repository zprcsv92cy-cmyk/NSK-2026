// Static staging build preflight: detect unresolved relative imports without deploying.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const entry = resolve('worker/staging-entry.js');
const visited = new Set();
const missing = new Set();
function scan(file) {
  if (visited.has(file)) return;
  visited.add(file);
  if (!existsSync(file)) { missing.add(file); return; }
  const code = readFileSync(file, 'utf8');
  for (const match of code.matchAll(/(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    if (!match[1].startsWith('.')) continue;
    scan(resolve(dirname(file), match[1]));
  }
}
scan(entry);
if (missing.size) {
  console.error('Missing staging modules (' + missing.size + '):');
  for (const file of [...missing].sort()) console.error(' - ' + file.replace(process.cwd() + '/', ''));
  process.exitCode = 1;
} else console.log('Staging imports resolved (' + visited.size + ' files).');
