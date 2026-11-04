import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reviewedAccounts,cheatingLabel} from '../public/hiscores/app.js';

test('badges require an explicit reviewed account, never a reported name',()=>{
  const reviewed=reviewedAccounts([{account:700001,reviewed_on:'2026-11-04'}]);
  assert.match(cheatingLabel(700001,reviewed),/manual review on 2026-11-04/);
  assert.match(cheatingLabel(700001,reviewed),/not a verdict on this individual score/);
  assert.equal(cheatingLabel(700002,reviewed),null);
  assert.equal(cheatingLabel('700001',reviewed),null);
  assert.equal(cheatingLabel(700001,reviewedAccounts([])),null);
  for(const bad of [null,[{account:1,reviewed_on:'yesterday'}],[{account:1,reviewed_on:'2026-02-30'}],[{account:1,reviewed_on:'2026-11-04',status:'reported'}],[{account:0,reviewed_on:'2026-11-04'}],[{account:1,reviewed_on:'2026-11-04'},{account:1,reviewed_on:'2026-11-04'}]])assert.throws(()=>reviewedAccounts(bad));
});

test('the published reviewed list contains only valid unique review decisions',async()=>{
  const data=JSON.parse(await readFile(new URL('../public/hiscores/reviewed.json',import.meta.url),'utf8'));
  assert.equal(reviewedAccounts(data).size,data.length);
});
