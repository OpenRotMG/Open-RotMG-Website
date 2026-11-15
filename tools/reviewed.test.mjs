import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewedAccounts,cheatingLabel} from '../public/hiscores/app.js';

test('badges require an explicit reviewed account, never a reported name',()=>{
  const reviewed=reviewedAccounts([{account:700001,reviewed_on:'2026-11-04'}]);
  assert.equal(cheatingLabel(700001,reviewed),'Uses cheat client');
  assert.equal(cheatingLabel(700002,reviewed),null);
  assert.equal(cheatingLabel('700001',reviewed),null);
  assert.equal(cheatingLabel(700001,reviewedAccounts([])),null);
  for(const bad of [undefined,null,[{account:1,reviewed_on:'yesterday'}],[{account:1,reviewed_on:'2026-02-30'}],[{account:1,reviewed_on:'2026-11-04',status:'reported'}],[{account:0,reviewed_on:'2026-11-04'}],[{account:1,reviewed_on:'2026-11-04'},{account:1,reviewed_on:'2026-11-04'}]])assert.throws(()=>reviewedAccounts(bad));
});
