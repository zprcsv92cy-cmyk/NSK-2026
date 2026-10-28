// Shared public asset allowlist for both hosting targets.
import fs from 'node:fs';
import path from 'node:path';
export function assembleFrontend(root,out){
const files='calendar-pool-reconcile.mjs concurrency-merge.mjs print-view.js arena-theme.css roster-view.js home-icon-black.png account-access.js account-users.js shell-entry.js app-shell.js private-skills.js view-cache.js equipment.js person-cards.js calendar-match-plan.mjs calendar-list.js index.html app.css app.js navigation.js home-training.js svenskalag-home.js changing-rooms.js training-cards.js shared-training.js auth.js config.js db.js deploy.json version.js sw.js manifest.webmanifest icon-192.png icon-512.png login-gate.js training-groups.js exercise-archive.js exercise-backup.js rink-drawer.js rink-text-parser.js exercise-rink-preview.js hockeyakademin-catalog.js pool-team-editor.js skate-fields.js qr-code.js sharpening-link-manager.js sharpening-public.js'.split(' ');
const folders='skills app aktivera anvandare bytesschema lag laguppstallning login malvaktsstatistik matchvy mittkonto skapapoolspel startsida truppen traningsgrupper ovningsarkiv ritverktyg materialforvaltare slipning'.split(' ');
for(const item of [...files,...folders])fs.cpSync(path.join(root,item),path.join(out,item),{recursive:true});
}
