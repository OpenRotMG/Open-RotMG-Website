import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCatalogue, validateSource, expandCatalogue, inventory, signature, inventorySignature, countChecks, filterChecks, variantBinding, leafState, blockers} from '../public/restoration/2010/catalogue.js';
import {mountCatalogue} from '../public/restoration/2010/app.js';
import {validateCatalogue as validate2012} from '../public/restoration/catalogue.js';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const catalogue = () => JSON.parse(read('public/restoration/2010/catalogue.json'));
const digest = value => createHash('sha256').update(value).digest('hex');
const baseline = catalogue(), baselineLeaves = validateCatalogue(baseline);
const counts = rows => rows.reduce((out, row) => (out[row.kind] = (out[row.kind] ?? 0) + 1, out), {});

test('July100 exact member sets and every ordered occurrence/parameter match the independently derived original inventory', () => {
  assert.equal(digest(JSON.stringify(inventory(baseline))), 'b22e6751e359fd0d3e034e55082e24472459f63d2501b70c7936f4d60792ea7d');
  assert.equal(signature(inventory(baseline)), inventorySignature);
  assert.deepEqual(counts(baseline.members), {Projectile:41, Player:7, Character:170, Container:4, Portal:6, Equipment:161, GameObject:120, Wall:19, Ground:115});
  assert.deepEqual(Object.fromEntries(Object.entries(baseline.occurrences).map(([family, rows]) => [family, rows.length])), {behavior:779, projectile:259, activation:147, loot:723});
  assert.equal(new Set(baseline.occurrences.behavior.map(row => row.name)).size, 33);
  assert.equal(baseline.occurrences.activation.filter(row => row.path === 'Activate').length, 52);
  assert.equal(baseline.occurrences.activation.filter(row => row.path === 'ActivateOnEquip').length, 94);
  assert.equal(baseline.occurrences.activation.filter(row => row.path === 'Projectile/ActivateOnEquip').length, 1);
  assert.equal(baseline.occurrences.loot.filter(row => row.item === null).length, 4);
  assert.equal(baseline.members.filter(m => m.fields.some(f => f[0] === 'Enemy')).length, 184);
  assert.equal(baselineLeaves.filter(leaf => leaf.template === 'attribute-qa').length, 779);
  assert.equal(baselineLeaves.filter(leaf => leaf.template === 'shoot-binding').length, 181);
  assert.equal(baselineLeaves.filter(leaf => leaf.template === 'xp-source').length, 196);
  assert.equal(baseline.members.filter(m => /^object-08/.test(m.id)).length,27);
  assert.equal(baseline.members.reduce((n,m)=>n+(m.audio?.length??0),0),565);
  assert.equal(baseline.systems.length,223);
  assert.equal(baselineLeaves.length, 10888);
  assert.equal(new Set(baselineLeaves.map(leaf => leaf.id)).size, 10888);
});

test('class starts/caps/growth bounds and twelve slot/loadout positions are independent leaves', () => {
  for (const member of baseline.members.filter(m => m.kind === 'Player')) {
    const rows = baselineLeaves.filter(leaf => leaf.group === member.id);
    for (const template of ['start', 'cap']) assert.equal(rows.filter(leaf => leaf.template === template).length, 8);
    assert.equal(rows.filter(leaf => leaf.template === 'growth').length, 16);
    assert.equal(rows.filter(leaf => leaf.template === 'slot').length, 24);
  }
});

test('ordinary class journeys bind each Player and cannot pass sibling classes or variants', () => {
  const journeys = baselineLeaves.filter(leaf => leaf.id.endsWith('-journey'));
  assert.equal(journeys.length, 7);
  assert.equal(baselineLeaves.some(leaf => leaf.id === 'class-journeys'), false);
  for (const member of baseline.members.filter(member => member.kind === 'Player')) {
    const leaf = journeys.find(leaf => leaf.group === member.id), binding = JSON.parse(leaf.binding);
    assert.equal(binding.class, member.id);
    assert.deepEqual(binding.slots, member.SlotTypes);
    assert.deepEqual(binding.loadout, member.Equipment);
    assert.equal(binding.ability.id, 'object-' + Number(member.Equipment[1]).toString(16).padStart(4, '0'));
    assert.deepEqual(binding.ability.actions, baseline.occurrences.activation.filter(row => row.owner === binding.ability.id));
  }
  const wizard = JSON.parse(journeys.find(leaf => leaf.group === 'object-030e').binding);
  assert.ok(wizard.startingItemRepairs.some(repair => repair.field === 'MpCost' && repair.original === '0' && repair.repaired === '40'));
  const d = catalogue();
  d.sources['fixture-test'] = {...d.sources['impl-world'], mode:'test'};
  d.results['object-030e-journey@original'] = {functional:'passed', historical:'unresolved', evidence:['fixture-test']};
  const leaves = validateCatalogue(d).filter(leaf => leaf.id.endsWith('-journey'));
  assert.equal(countChecks(d, leaves, 'original').functional.passed, 1);
  for (const leaf of leaves) assert.equal(leafState(d, leaf, 'original').functional, leaf.group === 'object-030e' ? 'passed' : 'not-run');
  assert.equal(countChecks(d, leaves, 'repaired').functional.passed, 0);
  d.results['class-journeys@original'] = d.results['object-030e-journey@original'];
  assert.throws(() => validateCatalogue(d), /Stale\/orphan/);
});

test('historical claims carry the existing typed period/comparator citations', () => {
  const leaf = id => baselineLeaves.find(row => row.id === id);
  assert.ok(leaf('system-xp-sharing').sources.includes('tig'));
  for (const facet of ['client', 'wire', 'lifecycle']) assert.ok(leaf('condition-18-' + facet).sources.includes('test101'));
  for (const source of ['test100', 'gamezplay', 'build104']) assert.ok(leaf('system-closure').sources.includes(source));
  assert.equal(baseline.sources.test101.kind, 'contemporary-testing');
  assert.equal(baseline.sources.tig.kind, 'earlier/later-comparator');
  assert.equal(baseline.sources.build104.kind, 'earlier/later-comparator');
  assert.equal(baseline.sources.gamezplay.kind, 'earlier/later-comparator');
  assert.equal(baseline.sources.gamezplay.url, 'https://gamezplay.blogspot.com/2010/07/realm-of-mad-god-flash-video-game.html');
  assert.match(baseline.sources.gamezplay.qualification, /2010-07-18.*Predates July26.*not an authenticated/);
  assert.match(baseline.sources.gamezplay.selector, /25,000.*50 Skull Shrines/);
});

test('original sign/tooltip selectors and0823 WhenClose survive beyond the scalar projection', () => {
  for (const [tag, count] of [['Text',16], ['Description',168], ['StatDescription',79]]) {
    const leaves = baselineLeaves.filter(leaf => leaf.template === 'presentation' && leaf.valuePath === tag);
    assert.equal(leaves.length, count);
    assert.ok(leaves.every(leaf => leaf.selector.endsWith('/' + tag) && leafState(baseline, leaf, 'original').functional === 'not-run'));
  }
  const sign = baseline.members.find(member => member.id === 'object-0823');
  assert.deepEqual(sign.presentation, ['Text']);
  assert.deepEqual(sign.whenClose, {radius:'3', boxes:[['0x0000ff',['614','510','40','40']],['0x00ff00',['746','366','40','40']]]});
  const leaf = baselineLeaves.find(leaf => leaf.id === 'object-0823-when-close');
  assert.deepEqual(JSON.parse(leaf.binding), sign.whenClose);
  assert.equal(leaf.selector, 'Objects/Object[@type=0x0823]/WhenClose');
  assert.match(leaf.unknowns.join(' '), /consumer execution and historical live use are Unknown/);
  assert.match(baselineLeaves.find(leaf => leaf.id === 'overlay-loot').expected, /0807 distance <= 1/);
  assert.ok(baseline.members.every(member => !member.fields.some(field => ['Text','Description','StatDescription'].includes(field[0]))));
});

test('presentation and proximity omissions fail explicit original-surface guards before the projection digest', () => {
  for (const tag of ['Text','Description','StatDescription']) {
    const d = catalogue(), member = d.members.find(member => member.presentation?.includes(tag));
    member.presentation = member.presentation.filter(value => value !== tag);
    assert.throws(() => validateCatalogue(d), new RegExp('Missing original ' + tag + ' presentation coverage'));
  }
  const d = catalogue(); delete d.members.find(member => member.id === 'object-0823').whenClose;
  assert.throws(() => validateCatalogue(d), /Missing original WhenClose coverage/);
  const wrongOwner = catalogue(), sign = wrongOwner.members.find(member => member.id === 'object-0823');
  wrongOwner.members[0].whenClose = sign.whenClose; delete sign.whenClose;
  assert.throws(() => validateCatalogue(wrongOwner), /Missing original WhenClose coverage/);
  const reversed = catalogue(); reversed.members.find(member => member.id === 'object-0823').whenClose.boxes.reverse();
  assert.throws(() => validateCatalogue(reversed), /binding mismatch/);
});

test('duplicates, absences, whitespace, compound conditions and corrected values are preserved', () => {
  const cube = baseline.occurrences.projectile.filter(row => row.owner === 'object-0237');
  assert.deepEqual(cube.map(row => row.attrs.id), ['0', '0']);
  const sprite = baseline.occurrences.behavior.filter(row => row.owner === 'object-022b' && row.name === 'Reproduce');
  assert.ok(sprite.some(row => row.attrs.childId === 'Sprite Child' && !Object.hasOwn(row.attrs, 'cooldown')));
  assert.equal(baseline.members.find(m => m.id === 'object-0208').name, 'Juvenile White Dragon ');
  assert.ok(baselineLeaves.some(leaf => leaf.group === 'object-0207' && leaf.unknowns.some(question => question.includes('No exact object-name match'))));
  const projectile = owner => baseline.occurrences.projectile.find(row => row.owner === owner).fields;
  assert.equal(projectile('object-0a86').find(f => f[0] === 'ObjectId')[1], 'Red Fire');
  assert.equal(projectile('object-0a87').find(f => f[0] === 'ObjectId')[1], 'Green Magic');
  assert.equal(baseline.members.find(m => m.id === 'object-0666').fields.find(f => f[0] === 'MaxHitPoints')[1], '200');
  assert.equal(baseline.occurrences.loot.filter(row => row.owner === 'object-0221' && row.item === '0707').length, 3);
  assert.deepEqual(baseline.occurrences.activation.filter(row => row.owner === 'object-0a5b').map(row => row.name), ['HealNova','RemoveNegativeConditions']);
  assert.deepEqual(baseline.occurrences.activation.filter(row => row.owner === 'object-0a5a' && row.path === 'Activate').map(row => row.name), ['Teleport','ConditionEffectSelf']);
  assert.deepEqual(baseline.members.find(m => m.id === 'object-0a55').fields.filter(f => f[0] === 'ConditionEffect').map(f => [f[1], f[2].duration]), [['Healing','20'],['Damaging','20']]);
});

test('all17 consumables and five unknown-acquisition items stay included, never excluded', () => {
  assert.equal(baseline.members.filter(m => m.kind === 'Equipment' && m.fields.some(f => f[0] === 'Consumable')).length, 17);
  const uncertain = baseline.members.filter(m => m.kind === 'Equipment' && m.availability.includes('no declared'));
  assert.deepEqual(uncertain.map(m => m.id).sort(), ['object-0a38','object-0a6e','object-0a74','object-0a77','object-0a7f']);
  for (const m of uncertain) assert.ok(baselineLeaves.some(leaf => leaf.group === m.id && leaf.id.endsWith('-placement') && leaf.binding.includes('availability unresolved')));
});

test('six dungeon contracts have independent access, roster, geometry, patterns, rewards, exits, retirement and multiplayer gates', () => {
  assert.equal(baseline.dungeons.length, 6);
  for (const dungeon of baseline.dungeons) {
    assert.equal(baseline.systems.filter(row => row.id.startsWith('dungeon-' + dungeon.id + '-')).length, 9);
    for (const member of dungeon.roster) assert.ok(baselineLeaves.some(leaf => leaf.group === 'object-' + member));
  }
  const keys = new Set(baseline.dungeons.map(d => d.key).filter(Boolean));
  assert.equal(keys.size, 5);
  assert.equal(baseline.occurrences.loot.filter(row => keys.has(row.item)).length, 13);
  assert.equal(baseline.dungeons.find(d => d.id === 'sprite').key, null);
});

for (const [label, mutate, pattern] of [
  ['wrong target', d => {d.target = 'calendar-2010';}, /target/],
  ['bad member type', d => {d.members[0].kind = 42;}, /member/],
  ['duplicate member', d => {d.members[1].id = d.members[0].id;}, /duplicate/],
  ['replaced identity at same count', d => {d.members[0].id = 'object-ffff';}, /binding mismatch/],
  ['missing occurrence', d => d.occurrences.behavior.pop(), /inventory/],
  ['missing non-DATA system', d => d.systems.pop(), /non-DATA/],
  ['changed occurrence operands', d => {d.occurrences.behavior[0].attrs.range = '999';}, /binding mismatch/],
  ['reordered occurrence', d => d.occurrences.behavior.reverse(), /owner\/order/],
  ['duplicate occurrence', d => {d.occurrences.behavior[1] = structuredClone(d.occurrences.behavior[0]);}, /owner\/order/],
  ['orphan occurrence', d => {d.occurrences.loot[0].owner = 'object-ffff';}, /owner\/order/],
  ['missing item reference', d => {d.occurrences.loot[0].item = 'ffff';}, /loot reference/],
  ['missing visual reference', d => {d.occurrences.projectile[0].fields[0][1] = 'not-a-visual';}, /visual reference/],
  ['bad scalar type', d => {d.members[0].fields = [['Size', 42, {}]];}, /member/],
  ['bad attribute type', d => {d.occurrences.behavior[0].attrs.range = 9;}, /parameters/],
  ['missing source', d => {d.templates.identity.sources = ['absent'];}, /source reference/],
  ['own source in historical field', d => {d.templates.identity.sources = ['impl-world'];}, /mixed source/],
  ['historical source in implementation field', d => {d.templates.identity.implementationSources = ['july'];}, /mixed source/],
  ['missing expected', d => {d.templates.identity.expected = '';}, /expected\/check/],
  ['missing concrete check', d => {delete d.templates.identity.check;}, /expected\/check/],
  ['missing confidence', d => {delete d.templates.identity.confidence;}, /confidence/],
  ['invalid implementation status', d => {d.templates.identity.implementation = 'restored';}, /status/],
  ['template pass', d => {d.templates.identity.passed = true;}, /cannot pass instances/],
  ['wrong condition namespace', d => {d.conditions.push('Stasis');}, /Wrong-era conditions/],
  ['wrong packet namespace', d => {d.packetIds.push(30);}, /Wrong-era protocol/],
  ['modern Tick body', d => {d.systems.find(s => s.id === 'packet-13').expected = 'tickId,tickTime,statuses';}, /Wrong-era protocol body/],
  ['modern teleport result', d => {d.systems.find(s => s.id === 'packet-29').expected = 'success flag,coordinates';}, /Wrong-era protocol body/],
  ['missing category gates', d => {delete d.questions.categories.combat;}, /questions/],
  ['missing variant gates', d => {delete d.questions.variants.repaired;}, /questions/],
]) test(`July catalogue rejects ${label}`, () => { const d = catalogue(); mutate(d); assert.throws(() => validateCatalogue(d), pattern); });

test('source kinds, confidence, URL hygiene and code pins cannot manufacture historical evidence', () => {
  for (const url of ['javascript:alert(1)', 'file:///home/private', 'https://user:pass@example.test/', 'https://example.test/?token=secret', 'https://example.test/?guid=private', 'https://example.test/.local/receipt.json', 'https://github.com/example/repo/blob/main/code.rs']) {
    const source = {...baseline.sources.july, url}; assert.throws(() => validateSource(source, 'probe'), /source URL|code source/);
  }
  for (const kind of ['artifact', 'contemporary-production', 'contemporary-testing', 'earlier/later-comparator']) assert.throws(() => validateSource({...baseline.sources['impl-world'], kind, mode: undefined}, 'probe'), /not history/);
  assert.throws(() => validateSource({...baseline.sources.july, confidence: 'certain'}, 'probe'), /confidence/);
  assert.throws(() => validateSource({...baseline.sources['impl-world'], url: baseline.sources['impl-world'].url.replace('128bd1de03aaace23381b8705488494490e9061f', 'a'.repeat(40))}, 'probe'), /Wrong implementation pin/);
  for (const source of Object.values(baseline.sources)) validateSource(source, 'valid');
});

test('one executed result never passes a template, sibling, or other variant', () => {
  const d = catalogue(), first = baselineLeaves[0], second = baselineLeaves.find(l => l.template === first.template && l.id !== first.id);
  d.sources['fixture-test'] = {...d.sources['impl-content'], mode:'test', label:'Test-only executed evidence fixture'};
  d.results[first.id + '@original'] = {functional:'passed', historical:'unresolved', evidence:['fixture-test']};
  const leaves = validateCatalogue(d);
  assert.equal(leafState(d, first, 'original').functional, 'passed');
  assert.equal(leafState(d, second, 'original').functional, 'not-run');
  assert.equal(leafState(d, first, 'repaired').functional, 'not-run');
  assert.equal(countChecks(d, leaves, 'original').functional.passed, 1);
  assert.equal(countChecks(d, leaves, 'repaired').functional.passed, 0);
  assert.equal(countChecks(d, leaves, 'original').complete, false);
});

test('stale/orphan result and source-only pass evidence fail closed', () => {
  for (const id of ['deleted-member@original', baselineLeaves[0].id + '@future', baselineLeaves[0].id + '@original@extra']) {
    const d = catalogue(); d.results[id] = {functional:'passed', historical:'unresolved', evidence:['impl-content']};
    assert.throws(() => validateCatalogue(d), /Stale\/orphan/);
  }
  const d = catalogue(); d.results[baselineLeaves[0].id + '@original'] = {functional:'passed',historical:'unresolved',evidence:['impl-content']};
  assert.throws(() => validateCatalogue(d), /executed evidence/);
});

test('unknown local/global/category/repair/variant gates prohibit verified verdicts even with functional acceptance', () => {
  const d = catalogue(); d.sources['fixture-test'] = {...d.sources['impl-content'],mode:'test'};
  for (const leaf of [baselineLeaves[0], baselineLeaves.find(l => l.repair)]) {
    d.results = {[leaf.id + '@original']:{functional:'passed',historical:'verified',evidence:['fixture-test']}};
    assert.throws(() => validateCatalogue(d), /Unsupported historical acceptance/);
  }
  const leaf = {...baselineLeaves[0], unknowns:[], sources:['july']};
  const minimal = structuredClone(d); minimal.results = {[leaf.id + '@original']:{functional:'passed',historical:'verified',evidence:['fixture-test']}};
  minimal.questions = {global:[], categories:{[leaf.domain]:[]}, variants:{original:[],repaired:[]}};
  assert.equal(countChecks(minimal, [leaf], 'original').complete, true);
  for (const place of ['global','category','variant','local']) {
    const probe = structuredClone(minimal), row = structuredClone(leaf);
    if (place === 'global') probe.questions.global.push('Unknown provenance');
    if (place === 'category') probe.questions.categories[leaf.domain].push('Unknown category');
    if (place === 'variant') probe.questions.variants.original.push('Known repair');
    if (place === 'local') row.unknowns.push('Unknown facet');
    assert.equal(countChecks(probe, [row], 'original').complete, false, place);
  }
});

test('nearly100 rounding cannot turn an exact incomplete count green', () => {
  const d = catalogue(), leaf = {...baselineLeaves[0], unknowns:[]};
  d.questions = {global:[], categories:{[leaf.domain]:[]}, variants:{original:[],repaired:[]}}; d.results = {};
  const leaves = Array.from({length:10001}, (_, i) => ({...leaf,id:'round-'+i}));
  for (const row of leaves.slice(0,-1)) d.results[row.id+'@original'] = {functional:'passed',historical:'verified',evidence:[]};
  assert.equal((100*10000/10001).toFixed(1), '100.0');
  const counts = countChecks(d, leaves, 'original');
  assert.equal(counts.historical.verified, 10000); assert.equal(counts.complete, false);
});

test('variant details expose every selected repair without rewriting original inventory', () => {
  assert.equal(baseline.repairs.length,24);
  assert.equal(baseline.repairs.filter(r => r.field !== 'StatDescription').length,23);
  assert.equal(new Set(baseline.repairs.map(r => r.owner)).size,8);
  const leaf = baselineLeaves.find(l => l.group === 'object-0a00' && l.valuePath === 'MinDamage');
  assert.match(variantBinding(baseline,leaf,'original'), /MinDamage=400/);
  assert.match(variantBinding(baseline,leaf,'repaired'), /MinDamage=30/);
  const cloak=baselineLeaves.find(l=>l.group==='object-0a56'&&l.valuePath==='ConditionEffect');
  assert.match(variantBinding(baseline,cloak,'repaired'), /ConditionEffect\/@duration=3/);
  const action=baselineLeaves.find(l=>l.group==='object-0a55'&&l.template==='activation'&&l.valuePath==='Activate');
  assert.match(action.binding,/Healing/);assert.match(action.binding,/Damaging/);
  assert.equal(baselineLeaves.find(l=>l.group==='object-0701'&&l.template==='activation').implementation,'missing');
  assert.throws(() => variantBinding(baseline,leaf,'future'), /variant/);
});

test('search/domain/status counts are exact check counts, not overlapping member totals', () => {
  assert.equal(filterChecks(baseline,baselineLeaves,{status:'verified'}).length,0);
  assert.equal(filterChecks(baseline,baselineLeaves,{status:'not-run'}).length,10888);
  const all = Object.keys(baseline.domains).flatMap(domain => filterChecks(baseline,baselineLeaves,{domain}));
  assert.equal(new Set(all.map(l=>l.id)).size,10888);
  const matches = filterChecks(baseline,baselineLeaves,{query:'Red Fire',domain:'classes'});
  assert.ok(matches.length>0); assert.ok(matches.every(l=>l.domain==='classes'));
});

class Element {
  constructor(tag='div') {this.tagName=tag;this.children=[];this.events={};this.value='';this.hidden=true;this.open=false;this._text='';}
  set textContent(value) {this._text=String(value);this.children=[];}
  get textContent() {return this._text+this.children.map(c=>c.textContent).join('');}
  set innerHTML(_) {throw new Error('Untrusted HTML assignment');}
  append(...nodes) {this.children.push(...nodes);}
  replaceChildren(...nodes) {this._text='';this.children=[...nodes];}
  addEventListener(type,callback) {(this.events[type]??=[]).push(callback);}
  dispatch(type) {for (const fn of this.events[type]??[]) fn({preventDefault(){}});}
  showModal(){this.open=true;}
  close(){this.open=false;}
  scrollIntoView(){this.scrolled=true;}
}
const descendants = node => [node,...node.children.flatMap(descendants)];
function dom(hash='') {
  const ids=['search-form','check-dialog','check-close','check-title','check-status','check-content','domain','search','status','variant','clear','completion','implementation-summary','historical-summary','functional-summary','questions-summary','inventory-summary','visible-count','areas','checks','filters','global-gates','error','roadmap','roadmap-nav','roadmap-summary','technical'];
  const nodes = Object.fromEntries(ids.map(id=>[id,new Element()]));nodes.variant.value='original';
  const document={createElement:tag=>new Element(tag),getElementById:id=>nodes[id]??Object.values(nodes).flatMap(descendants).find(n=>n.id===id)};
  const window={location:{hash},events:{},addEventListener(type,callback){this.events[type]=callback;}};
  return {nodes,document,window};
}
const success = data => async()=>({ok:true,json:async()=>data});

test('native DOM seam renders every group with safe text, exact filters, details, close and stable check/member links', async () => {
  const d=catalogue(), hostile='<img src=x onerror=alert(1)>';d.systems[0].name=hostile;
  const env=dom('#check=condition-11-client&variant=repaired'), errors=[];
  const mounted=await mountCatalogue(env.document,success(d),env.window,{error:e=>errors.push(e)});
  assert.ok(mounted);assert.equal(errors.length,0);assert.equal(env.nodes.filters.disabled,false);
  assert.equal(env.nodes['check-dialog'].open,true);assert.match(env.nodes['check-content'].textContent, /-y,-x,-rotation/);
  assert.match(env.nodes['questions-summary'].textContent,/Global gates: 4 · category gates: 10 · repaired variant gates: 1 · leaf-local question bindings: 10889/);
  assert.equal(env.nodes.variant.value,'repaired');assert.match(env.nodes['visible-count'].textContent,/10888 \/ 10888/);
  assert.equal(descendants(env.nodes.checks).filter(n=>n.tagName==='details').length,new Set(baselineLeaves.map(l=>l.domain+':'+l.group)).size);
  assert.ok(env.nodes.checks.textContent.includes(hostile));assert.equal(descendants(env.nodes.checks).filter(n=>n.tagName==='img').length,0);
  env.nodes['check-close'].dispatch('click');assert.equal(env.nodes['check-dialog'].open,false);
  env.nodes.search.value='Falchion';env.nodes.search.dispatch('input');
  assert.match(env.nodes['visible-count'].textContent,new RegExp('^'+filterChecks(d,mounted.leaves,{query:'Falchion',variant:'repaired'}).length+' /'));
  const member=descendants(env.nodes.checks).find(n=>n.tagName==='details');member.open=true;member.dispatch('toggle');
  const anchors=descendants(member).filter(n=>n.tagName==='a');assert.ok(anchors.length>0);assert.ok(anchors.every(n=>n.href.startsWith('#check=')));
  env.nodes.status.value='verified';env.nodes.status.dispatch('change');assert.equal(env.nodes.checks.children.length,0);assert.match(env.nodes['visible-count'].textContent,/^0 \/ 10888/);
  env.nodes.clear.dispatch('click');assert.match(env.nodes['visible-count'].textContent,/^10888/);
  env.window.location.hash='#member=object-0212';env.window.events.hashchange();
  const oryx=env.document.getElementById('member-enemies-object-0212');assert.equal(oryx.open,true);assert.equal(oryx.scrolled,true);
  assert.ok(descendants(oryx).some(n=>n.href?.includes('object-0212-behavior-1')));
});

test('roadmap-first DOM keeps technical details collapsed, opens area/member links and preserves honest statuses under filters', async () => {
  const env = dom('#area=tutorial'), errors = [], data = catalogue();
  data.roadmap[0].requirements[0].current = '<img src=x onerror=alert(1)>';
  const mounted = await mountCatalogue(env.document, success(data), env.window, {error:error=>errors.push(error)});
  assert.equal(env.nodes.technical.open, false);
  assert.equal(env.nodes.roadmap.children.length, 7);
  assert.equal(env.document.getElementById('area-tutorial').open, true);
  assert.match(env.nodes.roadmap.textContent, /Map layout and object placement/);
  assert.ok(env.nodes.roadmap.textContent.includes('<img src=x onerror=alert(1)>'));
  assert.equal(descendants(env.nodes.roadmap).some(node => node.tagName === 'img'), false);
  assert.match(env.nodes['roadmap-summary'].textContent, /7 areas need research.*0 restored/);
  assert.equal(env.nodes.completion.textContent, 'Restoration incomplete');
  env.nodes.status.value='verified';env.nodes.status.dispatch('change');
  assert.match(env.nodes['visible-count'].textContent, /^0 \/ 10888/);
  assert.equal(env.nodes.completion.textContent, 'Restoration incomplete');
  assert.equal(env.document.getElementById('area-tutorial').open, true);
  env.window.location.hash='#member=object-0823';env.window.events.hashchange();
  assert.equal(env.nodes.technical.open, true);
  assert.equal(env.document.getElementById('member-terrain-object-0823').open, true);
  env.window.location.hash='#area=unknown';env.window.events.hashchange();
  assert.equal(env.nodes.error.hidden, false);
  env.window.location.hash='#area=realm';env.window.events.hashchange();
  assert.equal(env.nodes.error.hidden, true);
  assert.equal(env.document.getElementById('area-realm').open, true);
  assert.equal(mounted.roadmap.length, 7);
  assert.equal(errors.length, 1);
});

test('hash navigation from a check to empty/domain/member destinations closes the old modal', async () => {
  const env = dom('#check=condition-11-client'), errors = [];
  await mountCatalogue(env.document, success(catalogue()), env.window, {error:error=>errors.push(error)});
  for (const destination of ['', '#domain-combat', '#member=object-0823']) {
    env.window.location.hash = '#check=condition-11-client'; env.window.events.hashchange();
    assert.equal(env.nodes['check-dialog'].open, true);
    env.window.location.hash = destination; env.window.events.hashchange();
    assert.equal(env.nodes['check-dialog'].open, false, destination);
  }
  const sign = env.document.getElementById('member-terrain-object-0823');
  assert.equal(sign.open, true); assert.equal(sign.scrolled, true);
  assert.equal(errors.length, 0);
});

for (const [name, fetcher, message] of [
  ['HTTP', async()=>({ok:false,status:503}), /HTTP 503/],
  ['network', async()=>{throw new Error('connection refused');}, /connection refused/],
  ['parse', async()=>({ok:true,json:async()=>{throw new SyntaxError('invalid JSON');}}), /invalid JSON/],
  ['schema', success({target:'2012'}), /target/],
]) test(`fetch/parse/schema ${name} failures remain visible, no2012 fallback`, async()=>{
  const env=dom(),errors=[];const result=await mountCatalogue(env.document,fetcher,env.window,{error:e=>errors.push(e)});
  assert.equal(result,null);assert.equal(env.nodes.error.hidden,false);assert.match(env.nodes.error.textContent,message);
  assert.equal(errors.length,1);assert.equal(env.nodes.completion.textContent,'Catalogue unavailable');assert.equal(env.nodes.checks.children.length,0);
});

test('unknown deep links fail visibly instead of opening an arbitrary nearby check', async()=>{
  const env=dom('#check=absent'),errors=[];await mountCatalogue(env.document,success(catalogue()),env.window,{error:e=>errors.push(e)});
  assert.equal(env.nodes.error.hidden,false);assert.match(env.nodes.error.textContent,/Unknown check link/);assert.equal(errors.length,1);
});

test('2012 retains its own validated catalogue and year navigation',()=>{
  const bytes=readFileSync(new URL('../public/restoration/progress.json',import.meta.url));
  const data=JSON.parse(bytes);assert.equal(data.scope.target,'123.5.1');
  assert.equal(data.features.length,211);assert.equal(data.categories.length,9);validate2012(data);
  assert.match(read('public/restoration/index.html'),/aria-label="Restoration year"/);
  assert.equal(read('public/2010/index.html').split('href="https://openrotmg.org/restoration/2010/"').length-1,1);
  assert.match(read('public/2010/index.html'),/July 2010 Realm of the Mad God client with minimal server/);
  const html=read('public/restoration/2010/index.html');
  assert.doesNotMatch(html,/RESTORATION_PERCENT|\u2014|onsubmit=|onclick=/);
  for(const id of ['search','domain','status','variant','visible-count','error'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(html,/role="alert"/);assert.match(html,/<dialog[^>]+aria-labelledby=/);
  for(const path of ['public/restoration/2010/app.js','public/restoration/2010/catalogue.js','public/restoration/2010/style.css']) assert.doesNotMatch(read(path),/\u2014|\.innerHTML|insertAdjacentHTML/);
});
