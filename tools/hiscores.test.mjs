import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boards,ranked,collectionSets,highestFameDeaths,graveyard,ownershipCounts} from '../public/hiscores/app.js';

test('existing ranking boards and competition ties remain stable',()=>{
 assert.equal(boards.base_fame.title,'Living fame');
 assert.equal(boards.base_fame.description,'Highest fame of an alive character per account.');
 for(const board of Object.keys(boards)){
  const players=[{account:3,name:'Third',[board]:10},{account:2,name:'Second',[board]:10},{account:1,name:'First',[board]:20}];
  assert.deepEqual(ranked(players,board).map(p=>[p.account,p.rank]),[[1,1],[2,2],[3,2]]);
  assert.equal(players[0].account,3);
  for(const value of [undefined,-1,1.5,NaN])assert.throws(()=>ranked([{account:1,name:'Bad',[board]:value}],board),/Malformed/);
  assert.throws(()=>ranked([players[0],players[0]],board),/Malformed/);
 }
 assert.throws(()=>ranked([],'wallet'),/Unknown/);
});

test('highest deceased fame means awarded total fame, not latest death or base fame',()=>{
 const death=(id,account,total_fame,died_at)=>({id,account,total_fame,died_at,class:782,level:20,equipment:[-1,-1,-1,-1]});
 const deaths=[death(1,10,100,10),death(2,10,20,100),death(3,11,0,1),death(4,10,100,20),death(5,10,100,20)];
 const original=structuredClone(deaths),best=highestFameDeaths(deaths);
 assert.equal(best.get(10).id,5);assert.equal(best.get(11).id,3);assert.equal(best.has(12),false);
 assert.deepEqual(deaths,original);
 assert.throws(()=>highestFameDeaths([{...deaths[0],total_fame:-1}]),/Malformed/);
 assert.throws(()=>highestFameDeaths([{...deaths[0],class:9999}]),/Malformed/);
 assert.throws(()=>highestFameDeaths([{...deaths[0],equipment:[]}]),/Malformed/);
});

test('graveyard pagination includes boundary ties and rejects a timestamp that cannot advance',async()=>{
 const death=(id,time)=>({id,account:1,total_fame:id,died_at:time,class:782,level:20,equipment:[-1,-1,-1,-1]});
 const first=Array.from({length:500},(_,i)=>death(i+1,i+1)),calls=[];
 const deaths=await graveyard(async path=>{calls.push(path);return {deaths:calls.length===1?first:[first[499],death(501,501)]};});
 assert.equal(deaths.length,501);assert.deepEqual(calls,['/api/graveyard?since=0','/api/graveyard?since=500']);
 await assert.rejects(graveyard(async()=>({deaths:Array.from({length:500},(_,i)=>death(i+1,0))})),/Cannot paginate/);
 await assert.rejects(graveyard(async()=>({error:'bad'})),/Malformed/);
});

test('sets sort by missing count, keep complete sets last, and retain natural tier order',()=>{
 const item=(id,name,slot,tier)=>({id,name,slot,tier,dye:false});
 const items=[item(1,'Sword 10',1,10),item(2,'Sword 2',1,2),item(3,'UT sword',1,null),item(4,'Wand',8,1),item(5,'Shield',5,1)];
 const found=new Set([1,4]),original=structuredClone(items);
 const sets=collectionSets(items,found);
 assert.deepEqual(sets.map(g=>[g.name,g.missing]),[['Shields',1],['Swords',2],['Wands',0]]);
 assert.deepEqual(sets[1].items.map(i=>i.id),[2,1,3]);assert.deepEqual(items,original);
 assert.deepEqual(collectionSets([],new Set()),[]);
 assert.throws(()=>collectionSets([{id:99,slot:99,tier:1,dye:false}],new Set()),/Missing collection metadata/);
 assert.throws(()=>collectionSets([{id:99,slot:1}],new Set()),/Missing collection metadata/);
});

test('hiscores links use original pixel artwork and the selected uncluttered layout',async()=>{
 const index=await readFile(new URL('../public/hiscores/index.html',import.meta.url),'utf8');
 for(const key of Object.keys(boards))assert.ok(index.includes(`href="?board=${key}"`));
 assert.ok(index.includes("OPEN ROTMG'S ADVENTURERS"));
 assert.equal((index.match(/<nav class="board-tabs"[\s\S]*?<\/nav>/)[0].match(/<img /g)||[]).length,5);
 for(const forbidden of ['<select','RealmEye','Snapshot:','Character shown','Items personally picked'])assert.ok(!index.includes(forbidden));
 const app=await readFile(new URL('../public/hiscores/app.js',import.meta.url),'utf8');
 assert.ok(!app.includes('innerHTML'));
 assert.ok(index.includes('<dialog id="item-dialog" aria-labelledby="item-name">'));
 assert.ok(index.includes('aria-label="Close item details"'));
 assert.ok(app.includes('dialog.showModal()'));assert.ok(app.includes("dialog.addEventListener('click'"));
 assert.ok(app.includes("el('span','set-percent'"));
 for(const removed of ['player-subline','character-column','equipment-heading'])assert.ok(!index.includes(removed)&&!app.includes(removed));
 assert.ok(app.includes("el(board==='collection'?'a':'span','player-name',player.name)"));
 assert.ok(app.includes('playerLink.href=`?board=collection&player=${player.account}`'));
});

test('ownership percentages count zero-item players and reject invalid counts rather than guess',()=>{
 const eligible=new Set([1,2,3]);
 assert.deepEqual([...ownershipCounts({players:4,items:[{item:1,owners:2},{item:3,owners:4}]},eligible)],[[1,2],[2,0],[3,4]]);
 for(const bad of [undefined,{players:0,items:[]},{players:4,items:[{item:1,owners:5}]},{players:4,items:[{item:1,owners:-1}]},{players:4,items:[{item:99,owners:1}]},{players:4,items:[{item:1,owners:1},{item:1,owners:2}]}])assert.throws(()=>ownershipCounts(bad,eligible),/Malformed/);
});

test('catalogue sprites stay in the exact atlas with explicit collection metadata',async()=>{
 const items=JSON.parse(await readFile(new URL('../public/hiscores/items.json',import.meta.url),'utf8'));
 assert.equal(items.length,827);assert.equal(new Set(items.map(i=>i.id)).size,items.length);
 const png=await readFile(new URL('../public/hiscores/items.png',import.meta.url));assert.equal(png.readUInt32BE(16),320);assert.equal(png.readUInt32BE(20),672);
 for(const item of items){assert.ok(item.name);assert.ok(item.x>=0&&item.x+16<=320&&item.y>=0&&item.y+16<=672);assert.ok(Number.isSafeInteger(item.slot));assert.equal(typeof item.dye,'boolean');}
 assert.equal(collectionSets(items,new Set()).flatMap(g=>g.items).length,827);
});
