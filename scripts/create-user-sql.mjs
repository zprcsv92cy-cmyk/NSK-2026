// Run locally: node scripts/create-user-sql.mjs
// Prompts are intentionally not supported: supply values via environment variables.
// Required: NSK_USER_EMAIL, NSK_USER_NAME, NSK_USER_PASSWORD, NSK_TEAM_ID.
// Never commit the printed SQL: it contains a password verifier.
import { randomBytes, pbkdf2Sync, randomUUID } from 'node:crypto';

const email = String(process.env.NSK_USER_EMAIL || '').trim().toLowerCase();
const name = String(process.env.NSK_USER_NAME || '').trim();
const password = String(process.env.NSK_USER_PASSWORD || '');
const team = String(process.env.NSK_TEAM_ID || '').trim();
if (!email.includes('@') || !name || password.length < 16 || !team) {
  console.error('Ange NSK_USER_EMAIL, NSK_USER_NAME, NSK_USER_PASSWORD (minst 16 tecken) och NSK_TEAM_ID.');
  process.exitCode = 1;
} else {
  const salt = randomBytes(32);
  const hash = pbkdf2Sync(password, salt, 600000, 32, 'sha256');
  const verifier = ['pbkdf2-sha256', 600000, salt.toString('hex'), hash.toString('hex')].join('$');
  const id = randomUUID();
  const sqlString = value => "'" + String(value).replaceAll("'", "''") + "'";
  process.stdout.write([
    '-- Hantera denna SQL som känslig. Kör endast i avsedd AUTH_DB efter granskning.',
    'BEGIN TRANSACTION;',
    `INSERT INTO auth_users(id,email,display_name,password_hash) VALUES(${[id,email,name,verifier].map(sqlString).join(',')});`,
    `INSERT INTO auth_team_memberships(user_id,team_id,role) VALUES(${[id,team,'owner'].map(sqlString).join(',')});`,
    'COMMIT;',
    ''
  ].join('\n'));
}
