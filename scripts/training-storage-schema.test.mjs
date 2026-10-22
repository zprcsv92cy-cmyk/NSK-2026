import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/20261022_training_sessions.sql',import.meta.url),'utf8');
test('training storage is team and date scoped',()=>{
  assert.match(sql,/PRIMARY KEY \(team_id, training_date\)/);
  assert.match(sql,/revision INTEGER NOT NULL/);
  assert.match(sql,/updated_by TEXT NOT NULL/);
});
test('training storage contains no screenshot or OCR columns',()=>{
  assert.doesNotMatch(sql,/image|screenshot|ocr|filename|file_blob|base64/i);
});
