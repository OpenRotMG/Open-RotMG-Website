import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {mountCatalogue} from '../public/restoration/app.js';
import {records,validateCatalogue} from '../public/restoration/catalogue.js';

const json = path => JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const progress = json('../public/restoration/progress.json');
const evidence = json('../public/restoration/evidence.json');
const actors = json('./restoration-actors.fixture.json');
const rev = evidence.migration.reviewedRevision;
const cases = [
  ['home:nexus',/only the closest eligible injured player.*100 HP per one-second pulse/,/heals every eligible nearby player/],
  ['realm:nomads',/Magic Potion is a 4% private roll/,/one public Magic Potion4% roll/],
  ['dungeons:sprite-world',/private 30% Dexterity roll with a minimum of one.*no Defense potion row/,/Defense potion now rolls at 5%/],
  ['dungeons:pirate-cave',/Goblin Warrior has a 3% Pirate Cave portal roll.*Giant Crab has a 3%.*Sand Devil has a 3%.*Forest Nymph has a 5%.*any ordinary damage/,/cube-only at 1%.*below640 HP/],
  ['realm:deathmage',/four eight-second MakeMinions clocks with live caps of 4 Skeletons, 2 Skeleton Swordsmen, 1 Skeleton Veteran and 1 Skeleton Mage/,/every 10 seconds within living-child caps 5\/4\/3\/2\/1/],
];

test('restoration prose agrees with the selected actors.xml source rows', () => {
  const all = validateCatalogue(progress);
  for(const [id,live,prior] of cases){
    const r = all.find(r=>r.id===id).rule;
    assert.match(r.runtime.map(f=>f.fact).join(' '),live,id);
    assert(r.runtime.every(f=>f.url.includes(`/blob/${rev}/`)),id);
    assert.match(r.priorEngine.join(' '),prior,id);
    assert.doesNotMatch([r.expected,...r.differences,...r.unknowns].join(' '),prior,id);
    assert(r.unknowns.length,id);
  }
  assert.deepEqual(actors['0x01c7'],['<Behavior range="5" healing="100" cooldown="1.0" color="0xFFFFFF">HealZap</Behavior>']);
  assert.deepEqual(actors['0x06c6'],['<SoulboundLoot prob="0.04">Magic Potion</SoulboundLoot>']);
  assert(actors['0x0d06'].includes('<SoulboundLoot prob=".3" min="1">Potion of Dexterity</SoulboundLoot>'));
  assert(!actors['0x0d06'].some(row=>row.includes('Potion of Defense')));
  assert.deepEqual(actors['0x0925'].map(row=>row.match(/childIds="([^"]+)" cooldown="(\d+)" maxChildren="(\d+)"/).slice(1)), [
    ['Skeleton','8','4'],['Skeleton Swordsman','8','2'],['Skeleton Veteran','8','1'],['Skeleton Mage','8','1'],
  ]);
  assert.deepEqual(actors['0x0927'],['<Transition hitpointsLessThan=".9999">Boast</Transition>']);
  for(const [id,p] of Object.entries({'0x060e':3,'0x060f':4,'0x0610':3,'0x0613':3,'0x06c4':3,'0x06c7':3,'0x06d1':5}))
    assert.deepEqual(actors[id],[`<Behavior prob=".0${p}" childId="Pirate Cave Portal">MetamorphoseAtDeath</Behavior>`],id);
});

test('source excerpts and HealZap recipients match the pinned server checkout', {skip:!process.env.RESTORATION_SERVER_CHECKOUT}, () => {
  const read = file => execFileSync('git',['-C',process.env.RESTORATION_SERVER_CHECKOUT,'show',`${rev}:${file}`],{encoding:'utf8',maxBuffer:4*1024*1024});
  const xml = read('data/game/123.5.1/actors.xml');
  for(const [id,rows] of Object.entries(actors)){
    const start = xml.indexOf(`  <Object type="${id}"`);
    assert(start>=0,id);
    const body = xml.slice(start,xml.indexOf('\n  </Object>',start));
    const tag = id==='0x0d06'||id==='0x06c6' ? /Loot[ >]/ : new RegExp('>'+rows[0].split('>').at(-2)+'>$');
    assert.deepEqual(body.split('\n').map(line=>line.trim()).filter(line=>tag.test(line)),rows,id);
  }
  const runtime = read('src/world/xml.rs').split('fn xml_heal_targets(')[1].split('let mut kinds')[0];
  assert.match(runtime,/K::HealZap[\s\S]*xml_targets[\s\S]*character.hp[\s\S]*\.take\(1\)/);
  const tests = read('src/world/xml/admission_tests.rs');
  assert.match(tests,/xml_runtime_world_white_fountain_heals_only_the_closest_damaged_player_with_base_feedback/);
});

class Element {
  constructor(tag='div'){this.tag=tag;this.children=[];this.dataset={};this.classList={add(){}};this.value='all';}
  set textContent(text){this.text=text;this.children=[];}
  get textContent(){return [this.text,...this.children.map(n=>n.textContent)].join(' ');}
  get firstChild(){return this.children[0];}
  append(...nodes){this.children.push(...nodes);}
  prepend(...nodes){this.children.unshift(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  addEventListener(){}
  removeAttribute(){}
  showModal(){this.open=true;}
}

test('corrected modal rows render source facts and keep old balance out of current differences and roadmap', async () => {
  const nodes = new Map();
  const document={createElement:tag=>new Element(tag),getElementById:id=>{
    if(!nodes.has(id)) nodes.set(id,new Element());
    return nodes.get(id);
  }};
  for(const id of ['search','category'])document.getElementById(id).value='';
  const window={location:{hash:'#feature=home:nexus'},addEventListener(){}};
  const mounted=await mountCatalogue(document,async file=>({ok:true,json:async()=>file==='progress.json'?progress:evidence}),window,{error:assert.fail});
  assert(mounted);
  assert(nodes.get('feature-dialog').open);
  for(const [id,live,prior] of cases){
    mounted.openRecord(records(progress).find(r=>r.id===id));
    const sections=nodes.get('feature-audit').children;
    const history=sections.find(s=>s.className==='prior-engine');
    const current=sections.find(s=>s.children[0].textContent.trim()==='Candidate runtime sources');
    assert.match(current.textContent,live,id);
    assert.equal(history.tag,'details');
    assert.equal(history.children[0].textContent.trim(),'Prior-engine history');
    assert(!history.open);
    assert.match(history.textContent,prior,id);
    const withoutHistory = node => node.className==='prior-engine' ? '' : [node.text,...node.children.map(withoutHistory)].join(' ');
    assert.doesNotMatch(withoutHistory(nodes.get('feature-audit')),prior,id);
    assert.doesNotMatch(nodes.get('feature-audit').textContent,/Limits: undefined/,id);
    assert.doesNotMatch(nodes.get('roadmap').textContent,prior,id);
  }
});
