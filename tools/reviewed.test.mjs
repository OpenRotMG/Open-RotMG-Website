import test from 'node:test';
import assert from 'node:assert/strict';
import {boards,ranked,reviewedAccounts,cheatingLabel} from '../public/hiscores/app.js';

test('badges require an explicit reviewed account, never a reported name',()=>{
  const reviewed=reviewedAccounts([{account:700001,reviewed_on:'2026-11-04'}]);
  assert.equal(cheatingLabel(700001,reviewed),'Uses cheat client');
  assert.equal(cheatingLabel(700002,reviewed),null);
  assert.equal(cheatingLabel('700001',reviewed),null);
  assert.equal(cheatingLabel(700001,reviewedAccounts([])),null);
  for(const bad of [undefined,null,[{account:1,reviewed_on:'yesterday'}],[{account:1,reviewed_on:'2026-02-30'}],[{account:1,reviewed_on:'2026-11-04',status:'reported'}],[{account:0,reviewed_on:'2026-11-04'}],[{account:1,reviewed_on:'2026-11-04'},{account:1,reviewed_on:'2026-11-04'}]])assert.throws(()=>reviewedAccounts(bad));
});

test('hiding reviewed accounts recalculates competition ranks on every board',()=>{
  const reviewed=reviewedAccounts([{account:700001,reviewed_on:'2026-11-04'}]);
  for (const board of Object.keys(boards)) {
    const players=[{account:700001,name:'Marked',[board]:20},{account:700002,name:'First',[board]:10},
      {account:700003,name:'Tied',[board]:10},{account:700004,name:'Last',[board]:5}];
    const standings=rows=>rows.map(({account,rank})=>[account,rank]);
    assert.deepEqual(standings(ranked(players,board,reviewed)),[[700002,1],[700003,1],[700004,3]]);
    assert.deepEqual(standings(ranked(players,board)),[[700001,1],[700002,2],[700003,2],[700004,4]]);
  }
});
