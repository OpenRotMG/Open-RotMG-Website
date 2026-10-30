import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rowsFor,catalogueFor,percentage} from '../public/drop-rates/app.js';
const item={id:1,name:'Doom Bow'},other={id:2,name:'Other item'};
const group=(mode,entries,name='Septavius')=>({enemy:{name},mode,entries});
const entry=(probability,items)=>({probability,items});
const data=groups=>({items:[item,other],groups});
const art=[{id:1,bag:4,x:0,y:0},{id:2,bag:1,x:16,y:0}];
test('rates combine repeated rewards without losing tier selection, order or chest caps',()=>{
 assert.deepEqual(rowsFor(data([group('independent',[entry(.1,[1,2])])])).map(r=>Number(r.chance.toFixed(4))),[.05,.05]);
 assert.equal(rowsFor(data([group('ordered',[entry(.9,[2]),entry(.1,[1])])])).find(r=>r.item.id===1).chance.toFixed(4),'0.0100');
 assert.equal(rowsFor(data([group('independent',[entry(.5,[1]),entry(.5,[1])])]))[0].chance,.75);
 assert.equal(rowsFor(data([group('ordered',[entry(.2,[1]),entry(.4,[1])])]))[0].chance,.52);
 const items=Array.from({length:8},(_,id)=>({id,name:'Item '+id}));
 const rows=rowsFor({items,groups:[group('capped',items.map(i=>entry(1,[i.id])))]});
 assert.deepEqual(rows.map(r=>Number(r.chance.toFixed(4))),[1,1,1,.8,.6,.4,.2,0]);
 assert.equal(rowsFor(data([group('capped',[entry(.5,[1]),entry(.5,[1])])]))[0].chance,.75);
 assert.equal(percentage(.01),'1%');assert.equal(percentage(.001),'0.1%');
 assert.throws(()=>rowsFor(data([group('mystery',[])])),/Missing loot rules/);
 assert.throws(()=>rowsFor(data([group('independent',[entry(-1,[1])])])),/probability/);
});
test('one card per item groups equal NPC rates and retains different rates and numeric sources',()=>{
 const groups=[group('independent',[entry(.01,[1])],'Malphas'),group('independent',[entry(.01,[1])],'Abyss Idol'),group('independent',[entry(.05,[1])],'Guard'),group('independent',[entry(.01,[1])],'Malphas')];
 const sources=[{url:'https://example.org/rates',rates:[{items:[1],npc:'Malphas',probability:.001},{items:[1],npc:'Abyss Idol',probability:.001},{items:[1],npc:'Unrelated enemy',probability:.2}]}];
 const cards=catalogueFor(data(groups),art,sources);assert.equal(cards.length,1);assert.equal(cards[0].sprite.bag,4);
 assert.deepEqual(cards[0].rates.map(r=>[percentage(r.chance),r.npcs]),[['5%',['Guard']],['1%',['Abyss Idol','Malphas']]]);
 assert.deepEqual(cards[0].sources,[{chance:.001,url:'https://example.org/rates',npcs:['Abyss Idol','Malphas']}]);
 assert.throws(()=>catalogueFor(data(groups),[{id:1}],[]),/bag/);
 assert.throws(()=>catalogueFor(data(groups),art,[{url:'https://openrotmg.org/rates',rates:[]}]),/external/);
 assert.throws(()=>catalogueFor(data(groups),art,[{url:'https://example.org/rates',rates:[{items:[1],npc:'Malphas'}]}]),/source drop rate/);
});
test('only item-specific numeric references are published, without generic research or our code',()=>{
 const sources=JSON.parse(readFileSync(new URL('../public/drop-rates/sources.json',import.meta.url)));assert(sources.length>200);
 for(const source of sources){
  const url=new URL(source.url);assert.equal(url.protocol,'https:');assert(!url.hostname.endsWith('openrotmg.org'));assert.doesNotMatch(source.url,/Open-RotMG-|trapped\/rotmg_svr/);assert(source.rates.length);
  for(const rate of source.rates){assert(rate.npc);assert(rate.items.length);assert(rate.items.every(Number.isSafeInteger));assert(Number.isFinite(rate.probability)&&rate.probability>=0&&rate.probability<=1);}
 }
 const doom=sources.flatMap(s=>s.rates.filter(r=>r.items.includes(0xc02)).map(r=>[r.npc,r.probability,s.url]));
 assert(doom.some(([npc,p,url])=>npc==='Septavius the Ghost God'&&p===.001&&url.endsWith('/node/4466')));
 assert(doom.some(([npc,p,url])=>npc==='Septavius the Ghost God'&&p===.005&&url.includes('fabiano-swagger-of-doom')));
});
test('page has only the four bag filters, full results, short sources and matching share artwork',()=>{
 const html=readFileSync(new URL('../public/drop-rates/index.html',import.meta.url),'utf8');
 assert.match(html,/<option value="4">White bag<\/option><option value="3">Blue bag<\/option><option value="2">Cyan bag<\/option><option value="1">Purple bag/);
 assert.doesNotMatch(html,/Know what|historical odds|How to read|id="search"|id="category"|id="count"|previous|pagination|id="next"/);
 assert.match(html,/role="alert"/);assert.match(html,/app\.js\?v=\{\{DROP_RATES_VERSION\}\}/);assert.match(html,/style\.css\?v=\{\{DROP_RATES_VERSION\}\}/);
 const app=readFileSync(new URL('../public/drop-rates/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/Owner-selected|Historical rate unverified|General loot|Current implementation|source_file|eligibility|allocation|group.channel|toLocaleString|slice\(page/);
 const art=JSON.parse(readFileSync(new URL('../public/hiscores/items.json',import.meta.url)));assert(art.every(i=>Number.isInteger(i.bag)&&i.bag>=0&&i.bag<=4));assert.equal(art.find(i=>i.id===0xc02).bag,4);assert.equal(art.find(i=>i.id===0xa1f).bag,3);
 const about=readFileSync(new URL('../public/about/index.html',import.meta.url),'utf8');assert.match(about,/href="\{\{BASE\}\}drop-rates\/"/);
 const png=readFileSync(new URL('../public/drop-rates/social.png',import.meta.url));assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
});
