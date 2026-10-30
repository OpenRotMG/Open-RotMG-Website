import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rowsFor,selectRows,odds} from '../public/drop-rates/app.js';
const item={id:1,name:'Doom Bow',tier:null,slot:3},other={id:2,name:'Tiered bow',tier:4,slot:3};
const group=(mode,entries)=>({enemy:{id:8,name:'Septavius'},mode,entries,eligibility:'Damage threshold',allocation:'Private'});
const entry=(probability,items,balance=false)=>({probability,items,balance});
const data=groups=>({revision:'a'.repeat(40),items:[item,other],groups});
test('rates follow independent tier selection, ordered suppression and chest caps',()=>{
 assert.deepEqual(rowsFor(data([group('independent',[entry(.1,[1,2])])])).map(r=>r.chance),[.05,.05]);
 assert.equal(rowsFor(data([group('ordered',[entry(.9,[2]),entry(.1,[1])])])).find(r=>r.item.id===1).chance.toFixed(4),'0.0100');
 const rows=rowsFor(data([group('capped',Array.from({length:8},()=>entry(1,[1]))) ]));
 assert.deepEqual(rows.map(r=>Number(r.chance.toFixed(4))),[1,1,1,.8,.6,.4,.2,0]);
 assert.deepEqual(odds(.01),['1%','1 in 100']);assert.equal(odds(0)[0],'0%');
});
test('search and filters keep distinct sources and selected balance',()=>{
 const rows=rowsFor(data([group('independent',[entry(.01,[1],true),entry(.001,[2])])]));
 assert.equal(selectRows(rows,'doom sept','unique').length,1);
 assert.equal(selectRows(rows,'','rare')[0].item.id,2);
 assert.equal(selectRows(rows,'','balance')[0].item.id,1);
 assert.equal(selectRows(rows,'absent','all').length,0);
 assert.throws(()=>rowsFor(data([group('mystery',[])])),/Missing loot rules/);
 assert.throws(()=>rowsFor(data([group('independent',[entry(-1,[1])])])),/probability/);
});
test('every recorded research source is pinned or an archived capture, with retired provenance explicit',()=>{
 const sources=JSON.parse(readFileSync(new URL('../public/drop-rates/sources.json',import.meta.url)));
 assert(sources.length>400);const types=new Set();
 for(const source of sources){types.add(source.type);assert(source.enemies.length);assert(source.enemies.every(Number.isSafeInteger));const url=new URL(source.url);assert.equal(url.protocol,'https:');if(url.hostname==='github.com'&&/\/(blob|tree)\//.test(url.pathname))assert.match(url.pathname,/\/(blob|tree)\/[a-f0-9]{40}(\/|$)/);}
 assert.deepEqual([...types].sort(),['fsod','general','kithio','period','realmsrc','research','trapped']);
 const html=readFileSync(new URL('../public/drop-rates/index.html',import.meta.url),'utf8');
 assert.match(html,/Retired sources/);assert.match(html,/role="alert"/);
 const about=readFileSync(new URL('../public/about/index.html',import.meta.url),'utf8');assert.match(about,/href="\{\{BASE\}\}drop-rates\/"/);
 const png=readFileSync(new URL('../public/drop-rates/social.png',import.meta.url));assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
});
