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
  for (const ref of ['impl-world', 'impl-inventory-drop', 'impl-player-teleport', 'impl-priest-heals', 'impl-priest-starter-native']) for (const kind of ['artifact', 'contemporary-production', 'contemporary-testing', 'earlier/later-comparator']) assert.throws(() => validateSource({...baseline.sources[ref], kind, mode: undefined}, 'probe'), /not history/);
  assert.throws(() => validateSource({...baseline.sources.july, confidence: 'certain'}, 'probe'), /confidence/);
  assert.throws(() => validateSource({...baseline.sources['impl-world'], url: baseline.sources['impl-world'].url.replace('128bd1de03aaace23381b8705488494490e9061f', 'a'.repeat(40))}, 'probe'), /Wrong implementation pin/);
  for (const source of Object.values(baseline.sources)) validateSource(source, 'valid');
});

test('reviewed Drop19 evidence leaves the frozen audit and broad inventory acceptance intact', () => {
  const d = catalogue(), leaf = baselineLeaves.find(row => row.id === 'system-inventory');
  assert.equal(d.implementationPin, '128bd1de03aaace23381b8705488494490e9061f');
  assert.equal(d.sources['impl-inventory-drop'].mode, 'native');
  assert.match(d.sources['impl-inventory-drop'].url, /95dfd8cdfbb6de907d758c4c72073b338a6135c3/);
  assert.equal(leaf.implementation, 'partial');
  assert.equal(baselineLeaves.find(row => row.id === 'packet-19').expected, 'objectId i32, slotId u8, item type i16; exactly 7 body bytes.');
  for (const variant of ['original', 'repaired']) {
    assert.equal(leafState(d, leaf, variant).functional, 'not-run');
    assert.equal(leafState(d, leaf, variant).historical, 'unresolved');
  }
  d.implementationPin = '95dfd8cdfbb6de907d758c4c72073b338a6135c3';
  assert.throws(() => validateCatalogue(d), /implementation pin/);
});

test('reviewed teleport evidence preserves unresolved historical and full-game gates', () => {
  const d = catalogue(), source = d.sources['impl-player-teleport'];
  assert.equal(d.implementationPin, '128bd1de03aaace23381b8705488494490e9061f');
  assert.equal(source.mode, 'native');
  assert.match(source.url, /143b32856987c5d494e9788ec8a7dad1f567ff84/);
  assert.match(source.qualification, /reconstruction; reconnect resets server cooldown/);
  for (const [id, bytes] of [['packet-18', 12], ['packet-28', 4], ['packet-29', 0]]) {
    const leaf = baselineLeaves.find(row => row.id === id);
    assert.equal(leaf.implementation, 'present');
    assert.match(leaf.expected, new RegExp('exactly ' + bytes + ' body bytes'));
    assert.deepEqual(leaf.implementationSources, ['impl-player-teleport']);
  }
  const leaf = baselineLeaves.find(row => row.id === 'system-teleport');
  assert.equal(leaf.implementation, 'partial');
  for (const variant of ['original', 'repaired']) {
    assert.equal(leafState(d, leaf, variant).functional, 'not-run');
    assert.equal(leafState(d, leaf, variant).historical, 'unresolved');
    assert.equal(countChecks(d, baselineLeaves, variant).complete, false);
  }
});

test('ordinary Priest heals do not pass deferred compounds or unrelated class journeys', () => {
  const d = catalogue();
  assert.equal(d.sources['impl-priest-heals'].mode, 'test');
  assert.equal(d.sources['impl-priest-starter-native'].mode, 'native');
  assert.match(d.sources['impl-priest-heals'].url, /ff285b5e970a2cd9f71b71c68b388d41cf4b5203/);
  for (const owner of ['0a31', '0a32', '0a33', '0a3f', '0a5b']) {
    const leaf = baselineLeaves.find(row => row.id === 'object-' + owner + '-activation-0');
    assert.equal(leaf.implementation, ['0a31', '0a32', '0a33'].includes(owner) ? 'present' : 'missing');
    assert.equal(leaf.implementationSources.includes('impl-priest-starter-native'), owner === '0a31');
    for (const variant of ['original', 'repaired']) {
      assert.equal(leafState(d, leaf, variant).functional, 'not-run');
      assert.equal(leafState(d, leaf, variant).historical, 'unresolved');
    }
  }
  for (const leaf of baselineLeaves.filter(row => row.id.endsWith('-journey'))) {
    assert.equal(leaf.implementation, 'partial');
    assert.equal(leaf.implementationSources.includes('impl-priest-starter-native'), leaf.group === 'object-0310');
  }
});

test('prediction repair citations separate executed reconstruction from historical and ordinary-play claims', () => {
  const pin = '376b6425eb402de2271950e142866227b874534a';
  const tests = baseline.sources['impl-prediction-repair-tests'], native = baseline.sources['impl-prediction-repair-native'];
  for (const [source, mode, file] of [[tests, 'test', 'prediction_runtime_tests.rs'], [native, 'native', 'world.rs']]) {
    assert.equal(source.kind, 'implementation'); assert.equal(source.mode, mode);
    assert.equal(source.url, `https://github.com/dginovker/Open-RotMG-Server/blob/${pin}/src/build100/${file}`);
    assert.doesNotMatch(JSON.stringify(source), /\.local\/|\/home\/|guid=|credential|authenticated.?trace|profile\/|\.db\b/i);
    validateSource(source, 'prediction');
    for (const kind of ['artifact', 'contemporary-production', 'contemporary-testing', 'earlier/later-comparator']) {
      assert.throws(() => validateSource({...source, kind, mode: undefined}, 'prediction'), /not history/);
    }
    assert.throws(() => validateSource({...source, url: source.url.replace(pin, 'a'.repeat(40))}, 'prediction'), /Wrong implementation pin/);
  }
  assert.match(tests.selector, /prediction_runtime_known_living_enemy_self_only_drop_then_make/);
  assert.match(tests.selector, /prediction_actor_actual_sql_begin_failure_preserves_candidate_view_and_outputs/);
  assert.match(tests.selector, /prediction_actor_postcommit_full_or_closed_queue_detaches_no_delivery_or_replay/);
  for (const pattern of [/13 new.*334 total.*15 qualification guards/, /SQL begin failure and dispatcher fatality/, /no candidate install\/publication before commit/, /no Character writes/, /peer isolation/, /drained requests/, /full\/closed postcommit queues/]) assert.match(tests.qualification, pattern);
  for (const symbol of ['Room::repairable_enemy', 'Room::handle_at packet9', 'Room::publication']) assert.ok(native.selector.includes(symbol));
  for (const pattern of [/Unchanged repaired-client native acceptance only/, /PREPARED private Pirate HP20/, /prediction27\/Dead1 versus authoritative8 left HP12/, /visibility and collision.*peer untouched/, /real bow death occurred once/, /server-to-client-only 150ms WebSocket conditioning/, /Separately, actual public HTTPS\/WSS with normal Pirate HP5 and no relay/, /rejected quiver prediction56\/Dead1/, /HP121 and HP124.*MP100, XP1, inventories and generation1/, /Quivers remain unsupported and MP was not charged/, /Predicted rolls are not trusted and RNG is not synchronized/, /not double HP damage/, /not.*full Archer\/class acceptance/]) assert.match(native.qualification, pattern);
});

test('prediction repair stays scoped alongside the two-quiver increment without passing leaves', () => {
  const refs = ['impl-prediction-repair-tests', 'impl-prediction-repair-native'];
  const priorRefs = {'condition-1-client': [], 'condition-1-wire': [], 'condition-1-lifecycle': [], 'packet-9': ['impl-protocol'], 'combat-collision-matrix': ['impl-combat']};
  const scoped = baseline.systems.filter(row => row.implementationSources.some(ref => refs.includes(ref)));
  assert.deepEqual(scoped.map(row => row.id).sort(), Object.keys(priorRefs).sort());
  for (const row of scoped) {
    assert.equal(row.implementation, 'partial');
    assert.deepEqual(row.implementationSources, [...priorRefs[row.id], ...refs]);
    assert.deepEqual(row.sources, ['artifact']);
  }
  assert.equal(digest(JSON.stringify(baseline.systems.filter(row => !Object.hasOwn(priorRefs, row.id) && !['condition-4-wire', 'condition-4-lifecycle'].includes(row.id)))), '3330dfc41b884348066c1c0f2e21476a1fbd07e9b889e32b486f1cd1f782da3a');
  const frozen = structuredClone(baseline); delete frozen.sources; delete frozen.systems; delete frozen.roadmap;
  assert.equal(digest(JSON.stringify(frozen)), '8746920f0778d190e098747ca3edbe691ad593676811e0c9ceff8477a70e1b50');
  assert.equal(digest(JSON.stringify(Object.fromEntries(Object.entries(baseline.sources).filter(([id]) => ![...refs, 'impl-quiver-tests', 'impl-quiver-native'].includes(id))))), 'fc95d0b220e1d715f101985c59cca6ba66a3ff8da4a151042282ad5dad97c237');
  const roadmap = baseline.roadmap.map(area => ({...area, requirements: area.requirements.map(row => (area.id === 'combat' && ['Weapons, spells and projectiles', 'Conditions and their lifecycle'].includes(row.title)) || (area.id === 'multiplayer' && row.title === 'Identity, saves and world transitions') ? {...row, current: null} : row)}));
  assert.equal(digest(JSON.stringify(roadmap)), '63a4a090465819bdbf657dba0b64c84ed3c47f84cca1c56306e23f1c6366a2e6');
  const leaf = id => baselineLeaves.find(row => row.id === id);
  assert.match(leaf('condition-1-client').expected, /separate sticky client dead boolean.*without HP subtraction or local dictionary deletion/);
  assert.match(leaf('condition-1-client').check, /stat1 and stat29 do not clear.*bare same-ID Make10 fails.*self-only Drop11 then fresh Make10/);
  assert.match(leaf('condition-1-wire').expected, /exactly 13 body bytes: i32 target, u8 condition, u8 duration, i16 amount, u8 bullet, i32 source/);
  assert.match(leaf('condition-1-wire').check, /Distinguish enum1 from stat29 bitmask/);
  assert.match(leaf('condition-1-lifecycle').check, /not fabricated Dead expiry, refresh or stacking/);
  assert.equal(leaf('packet-9').expected, 'i32 target, u8 condition, u8 duration, i16 amount, u8 bullet, i32 source');
  assert.match(leaf('packet-9').check, /amount\/duration\/collision claims cannot damage, kill or authorize rewards/);
  assert.match(leaf('combat-collision-matrix').expected, /Dead\/Paused, faction, ProtectFromProjectiles, tile cover and Continues memory; Invisible is not projectile immunity/);
  assert.match(leaf('combat-collision-matrix').check, /Two aligned targets, owner\/observer, Invisible pre-existing hostile shot, repeated victim and recreated identity/);
  const quivers = ['object-0a61-activation-0', 'object-0a62-activation-0', 'object-0a63-activation-1', 'object-0a64-activation-1', 'object-0a65-activation-1'].map(leaf);
  assert.equal(quivers.length, 5);
  assert.deepEqual(quivers.map(row => row.implementation), ['partial', 'partial', 'missing', 'missing', 'missing']);
  assert.ok(quivers.every(row => row.name.endsWith(': Shoot')));
  assert.ok(baselineLeaves.filter(row => row.id.endsWith('-journey')).every(row => row.implementation === 'partial' && !row.implementationSources.some(ref => refs.includes(ref))));
  for (const variant of ['original', 'repaired']) {
    const totals = countChecks(baseline, baselineLeaves, variant);
    assert.deepEqual(totals.implementation, {present: 892, partial: 5595, missing: 1756, 'not-inspected': 2645});
    assert.deepEqual(totals.functional, {'not-run': 10888, passed: 0, failed: 0});
    assert.deepEqual(totals.historical, {unresolved: 10864, verified: 0, differences: 24});
    assert.equal(totals.complete, false);
  }
});

test('quiver citations are immutable typed implementation evidence with separate public and prepared scopes', () => {
  const pin = '0205427d7d7609047b07c728c651780222f766c6';
  const tests = baseline.sources['impl-quiver-tests'], native = baseline.sources['impl-quiver-native'];
  assert.equal(baseline.implementationPin, '128bd1de03aaace23381b8705488494490e9061f');
  for (const [source, mode, file] of [[tests, 'test', 'quiver_runtime_tests.rs'], [native, 'native', 'world.rs']]) {
    assert.equal(source.kind, 'implementation'); assert.equal(source.mode, mode);
    assert.equal(source.url, `https://github.com/dginovker/Open-RotMG-Server/blob/${pin}/src/build100/${file}`);
    assert.doesNotMatch(JSON.stringify(source), /\u2014|\.local\/|\/home\/|guid=|credential|profile\/|\.db\b/i);
    validateSource(source, 'quiver');
    assert.throws(() => validateSource({...source, mode: 'source-only'}, 'quiver'), /evidence mode/);
    assert.throws(() => validateSource({...source, url: source.url.replace(pin, 'a'.repeat(40))}, 'quiver'), /Wrong implementation pin/);
    for (const kind of ['artifact', 'contemporary-production', 'contemporary-testing', 'earlier/later-comparator']) assert.throws(() => validateSource({...source, kind, mode: undefined}, 'quiver'), /not history/);
  }
  for (const symbol of ['quiver_runtime_native_paid_shoot8_then_nonpaying_use15_original_repaired', 'quiver_runtime_shared_native_ids_wrap_retired_reuse_live_and_reserved_burst_collisions', 'quiver_actor_sql_begin_at_each_phase_and_write_at8_preserve_actual_prephase', 'quiver_transport_encrypted_split_coalesced_serial_awaited_replies_no_adjacency_or_deadlock']) assert.ok(tests.selector.includes(symbol));
  for (const pattern of [/23 new.*357 total.*15 real Cargo/, /cloned root RNG.*not ATK or claimed damage/, /non-paying Use15.*ephemeral Room\/avatar marker/, /no waiting for15/, /pending bow bursts/, /failure at15 preserves committed8\/payment/, /fatal StorageFailure.*output loss never refund or replay/, /whole positive-on-entry.*equality/, /post-AI collision.*next advance/, /not duration255\/256 boundary acceptance/, /reconstruction.*not recovered July server policy/]) assert.match(tests.qualification, pattern);
  for (const symbol of ['Room::handle_at', 'Room::use_ability', 'Room::advance_shore', 'Room::advance', 'Room::entity_wire_stats', 'Room::publication']) assert.ok(native.selector.includes(symbol));
  for (const pattern of [/Actual public HTTPS\/WSS, normal HP5.*no fixture or relay/, /one60MP.*no caster echo.*one peer arrow.*server66 versus native68/, /XP1->3 each/, /Insufficient MP emitted no8\/15/, /HP5 deaths do not prove surviving Slowed/, /PREPARED private HP500/, /Reinforced starter override paid80MP.*native87\/server75/, /3030ms\/3129ms.*not exact historical timing/, /acquisition was prepared, not earned/, /PREPARED HP80.*downstream-only150ms.*no payload, Origin or RNG rewrite/, /native87\/Dead1 versus server72 leftHP8/, /Drop11->fresh Make10 same ID\/current HP8\/mask8.*peer not reset/, /Earlier native78\/server87 real death and XP8 were retained/, /no favorable-roll reset/, /Player Slowed admission\/held-key behavior/, /history remains unresolved/]) assert.match(native.qualification, pattern);
});

test('quivers change exactly four expanded leaves while every other aspect, journey and acceptance gate stays frozen', () => {
  const refs = ['impl-quiver-tests', 'impl-quiver-native'];
  const scopedIds = ['object-0a61-activation-0', 'object-0a62-activation-0', 'condition-4-wire', 'condition-4-lifecycle'];
  const scoped = baselineLeaves.filter(row => row.implementationSources.some(ref => refs.includes(ref)));
  assert.deepEqual(scoped.map(row => row.id).sort(), [...scopedIds].sort());
  for (const leaf of scoped) {
    assert.equal(leaf.implementation, 'partial');
    assert.deepEqual(leaf.implementationSources, [...(leaf.id.startsWith('object-') ? ['impl-world'] : []), ...refs]);
  }
  // These digests freeze the pre-increment expanded surface, not just the inventory counts.
  assert.equal(digest(JSON.stringify(baselineLeaves.filter(row => !scopedIds.includes(row.id)))), '200dc0216516fe8d9d960d92d1427076268271a9a29bd18a6ad2e693d3d8feda');
  assert.equal(digest(JSON.stringify(scoped.map(({implementation, implementationSources, check, unknowns, ...row}) => row))), '56a9176ab72bda4e4295bfb1c20953f41719e1d2ac47809132b9a723fbcea9c8');
  assert.equal(digest(JSON.stringify(baselineLeaves.filter(row => row.id.endsWith('-journey')))), 'e4ada9b5a32ff09e32be427e6d9ae438fbd1310d686a40423ddb05d9148b5d71');
  const leaf = id => baselineLeaves.find(row => row.id === id);
  assert.equal(leaf('condition-4-client').implementation, 'not-inspected');
  assert.deepEqual(leaf('condition-4-client').implementationSources, []);
  for (const id of ['condition-4-wire', 'condition-4-lifecycle']) assert.equal(leaf(id).expected, 'Movement early-return .005 before Berserk.');
  assert.match(leaf('condition-4-wire').check, /Damage9 enum4\/duration3.*stat29 mask8.*does not accept duration255\/256/);
  assert.match(leaf('condition-4-lifecycle').check, /Enemy-only transient.*overwrites remaining3s, not max\/stack.*whole positive-on-entry.*equality clear.*next-advance.*unchanged attack\/state clocks.*cleanup/);
  assert.match(leaf('condition-4-lifecycle').unknowns.join(' '), /Player admission\/held-key effects.*historical policy remain Unknown/);
  for (const id of ['object-0a63-activation-1', 'object-0a64-activation-1', 'object-0a65-activation-1']) assert.equal(leaf(id).implementation, 'missing');
  assert.deepEqual(baseline.results, {});
  for (const variant of ['original', 'repaired']) {
    const totals = countChecks(baseline, baselineLeaves, variant);
    assert.deepEqual(totals.functional, {'not-run': 10888, passed: 0, failed: 0});
    assert.deepEqual(totals.historical, {unresolved: 10864, verified: 0, differences: 24});
    assert.equal(totals.complete, false);
  }
  assert.equal(baseline.roadmap.length, 7);
  assert.equal(baseline.roadmap.reduce((n, area) => n + area.requirements.length, 0), 30);
  const combat = baseline.roadmap.find(area => area.id === 'combat').requirements;
  assert.match(combat.find(row => row.title === 'Weapons, spells and projectiles').current, /Tattered.*normal public native.*Reinforced.*prepared private.*not earned.*Other abilities\/projectiles and original server rules remain unverified/);
  assert.match(combat.find(row => row.title === 'Conditions and their lifecycle').current, /Enemy Slowed is partial.*public HP5 deaths do not prove duration.*Player Slowed.*unverified/);
  assert.equal(digest(readFileSync(new URL('../public/restoration/progress.json', import.meta.url))), 'ad1ff485f78a1f71682f05171bd5c9f122463afda26e259d2a50d94afdb59b53');
  // The legacy ledger now includes its separately verified idle-lifecycle increment.
  assert.equal(digest(readFileSync(new URL('../public/restoration/evidence.json', import.meta.url))), '7a574307f8958fc09388b3d9b2bb6ce774164dae9b43efbd8a45cf68119e0d2c');
});

test('archived healing testimony stays approximate testing evidence, not server authority', () => {
  const s = catalogue().sources['period-healing-20100807'];
  assert.equal(s.kind, 'contemporary-testing');
  assert.equal(s.confidence, 'medium');
  assert.equal(Object.hasOwn(s, 'mode'), false);
  assert.match(s.url, /20100807092328id_.*943#comment-5639$/);
  assert.match(s.qualification, /approximately 10 to 35 HP\/sec/);
  assert.match(s.qualification, /exact Healing arithmetic remain unknown/);
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
