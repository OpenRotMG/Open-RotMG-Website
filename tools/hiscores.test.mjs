import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ranked} from '../public/hiscores/app.js';
test('one account per row, living/dead metric, stable competition ties and no mutating sort',()=>{
 const players=[{account:3,name:'Third',base_fame:10},{account:2,name:'Second',base_fame:10},{account:1,name:'First',base_fame:20}];
 assert.deepEqual(ranked(players,'base_fame').map(p=>[p.account,p.rank]),[[1,1],[2,2],[3,2]]);
 assert.equal(players[0].account,3);assert.throws(()=>ranked(players,'wallet'),/Unknown/);
 assert.throws(()=>ranked([{account:1,name:'Bad',base_fame:-1}],'base_fame'),/Malformed/);
 assert.throws(()=>ranked([players[0],players[0]],'base_fame'),/Malformed/);
});
test('current drop sprites are unique, named, in the exact bounded atlas',async()=>{
 const items=JSON.parse(await readFile(new URL('../public/hiscores/items.json',import.meta.url),'utf8'));
 assert.equal(items.length,56);assert.equal(new Set(items.map(i=>i.id)).size,56);
 for(const item of items){assert.ok(item.name);assert.ok(item.x>=0&&item.x<=304&&item.y>=0&&item.y<=32);}
 const png=await readFile(new URL('../public/hiscores/items.png',import.meta.url));assert.equal(png.readUInt32BE(16),320);assert.equal(png.readUInt32BE(20),48);
 const app=await readFile(new URL('../public/hiscores/app.js',import.meta.url),'utf8');assert.ok(!app.includes('innerHTML'));assert.match(app,/className = found.has/);
});
