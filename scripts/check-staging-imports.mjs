// Static staging build preflight: detect unresolved relative imports without deploying.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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
} else {
  console.log('Staging imports resolved (' + visited.size + ' files).');
  for (const file of visited) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      console.error('Invalid staging module syntax: ' + file.replace(process.cwd() + '/', ''));
      console.error(result.stderr || result.error?.message || 'Unknown syntax check error');
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log('Staging module syntax verified (' + visited.size + ' files).');
}
