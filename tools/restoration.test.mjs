import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogue, validateSources, needsWork } from '../public/restoration/catalogue.js';

const catalogue = () => JSON.parse(readFileSync(new URL('../public/restoration/progress.json', import.meta.url), 'utf8'));

test('requested category icons are distinct original sprites', () => {
  const data = catalogue(), icons = Object.fromEntries(data.categories.map(c => [c.id, c.icon]));
  assert.notEqual(icons.heroes, icons.access);
  assert.equal(icons.access, 'assets/player/client-and-accounts.png');
  assert.equal(icons.conditions, data.features.find(f => f.name === 'Armor broken').icon);
  assert.equal(icons.social, 'assets/player/chat.png');
  for (const path of Object.values(icons)) {
    const png = readFileSync(new URL(`../public/restoration/${path}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  }
});

test('merged restoration capabilities no longer claim to be unsupported', () => {
  const data = catalogue();
  for (const [id, implementation, stage] of [
    ['gear:xp-booster', 'present', 1],
    ['access:character-slots', 'present', 0],
    ['access:change-password', 'present', 0],
    ['home:choose-your-name', 'present', 0],
    ['dungeons:forbidden-jungle', 'present', 0],
    ['dungeons:manor-of-the-immortals', 'present', 0],
    ['realm:great-coil-snake', 'present', 0],
    ['realm:kage-kami', 'present', 0],
    ['realm:find-your-next-quest', 'present', 0],
    ['home:vault', 'present', 0],
    ['access:player-art-gallery', 'present', 0],
    ['access:player-art-editor', 'present', 0],
    ...['swords', 'daggers', 'bows', 'wands', 'staves', 'leather-armor', 'heavy-armor', 'robes', 'rings'].map(name => ['gear:' + name, 'present', 0]),
    ['social:chat', 'partial', 0],
  ]) {
    const feature = data.features.find(f => f.id === id);
    assert.equal(feature.audit.implementation, implementation, id);
    assert.equal(feature.audit.historical, 'partial', id);
    assert.deepEqual(feature.audit.differences, [], id);
    assert.equal(feature.stage, stage, id);
    assert.ok(feature.audit.unknowns.length > 0, id);
  }
});

test('worklist separates implementation gaps from historical uncertainty', () => {
  const data = catalogue(), byId = id => data.features.find(f => f.id === id);
  assert.equal(needsWork(byId('realm:kage-kami')), false);
  assert.equal(needsWork(byId('dungeons:manor-of-the-immortals')), true);
  const recovery = byId('access:account-recovery');
  assert.equal(needsWork(recovery), false);
  assert.equal(recovery.audit.historical, 'known-differences');
  assert.match(recovery.audit.differences.join(' '), /intentionally replaces/);
  for (const id of ['heroes:fame-bonuses', 'gear:seasonal-toys', 'dungeons:undead-lair', 'realm:wasp-queen', 'realm:great-lizard', 'realm:shambling-sludge']) {
    const feature = byId(id);
    assert.equal(feature.audit.implementation, 'partial', id);
    assert.equal(needsWork(feature), true, id);
    assert.ok(feature.audit.differences.length, id);
  }
  assert.match(byId('heroes:fame-bonuses').audit.differences.join(' '), /Only Well Equipped.*other named death bonuses/);
  assert.match(byId('gear:seasonal-toys').audit.differences.join(' '), /Firecrackers work.*Sand Castle/);
  assert.match(byId('dungeons:undead-lair').audit.differences.join(' '), /does not explicitly mark/);
  assert.doesNotMatch(byId('access:server-selection').audit.differences.join(' '), /usage.*zero/i);
  for (const id of ['dungeons:tomb-of-the-ancients', 'dungeons:davy-jones-s-locker', 'dungeons:mad-lab', 'dungeons:beachzone']) assert.equal(byId(id).audit.implementation, 'missing', id);
  assert.equal(validateCatalogue(data).work, data.features.filter(needsWork).length);
});

test('component coverage preserves the scored inventory without awarding verification', () => {
  const data = catalogue(), checks = data.features.flatMap(f => f.audit.checks ?? []);
  assert.equal(data.features.length, 211);
  assert.equal(checks.length, 70);
  assert.equal(new Set(checks.map(c => c.id)).size, 70);
  assert.deepEqual(Object.fromEntries(['missing', 'partial', 'verify', 'substituted', 'verified'].map(status => [status, checks.filter(c => c.status === status).length])), { missing: 22, partial: 17, verify: 30, substituted: 1, verified: 0 });
  assert.equal(checks.filter(c => /^realm:map-world-\d+$/.test(c.id)).length, 13);
  const { e, v, n, percent } = validateCatalogue(data);
  assert.deepEqual({ e, v, n, percent }, { e: 3, v: 0, n: 211, percent: '0.7%' });
  assert.ok(!checks.some(c => /barrel-activation-summons-and-loot-research|treasure-research|oryx-taunts/.test(c.id)));
});

test('deep audit keeps concrete environment and collision defects visible', () => {
  const data = catalogue(), byId = id => data.features.find(f => f.id === id);
  for (const id of ['condition:24', 'dungeons:spider-den', 'dungeons:sprite-world']) assert.equal(byId(id).audit.implementation, 'partial', id);
  assert.match(byId('condition:24').audit.differences.join(' '), /hostile shots.*Invincible non-human/);
  assert.match(byId('dungeons:spider-den').audit.differences.join(' '), /pillar/);
  const cellar = byId('dungeons:wine-cellar');
  assert.match(cellar.audit.differences.join(' '), /no Wine Barrels.*persistent Slowed\/Sick trail/);
  assert.match(cellar.audit.unknowns.join(' '), /zero XP does not establish zero loot/);
  assert.equal(cellar.audit.checks.find(c => /barrel-destruction$/.test(c.id)).status, 'missing');
});

test('component validation rejects malformed or colliding checks', () => {
  for (const change of [c => { c.status = 'done'; }, c => { c.acceptance = ''; }, c => { c.id = 'realm:realm-generation'; }]) {
    const data = catalogue(); change(data.features.find(f => f.audit.checks).audit.checks[0]);
    assert.throws(() => validateCatalogue(data), /Invalid component check/);
  }
  const data = catalogue(), groups = data.features.filter(f => f.audit.checks);
  groups[1].audit.checks[0].id = groups[0].audit.checks[0].id;
  assert.throws(() => validateCatalogue(data), /Invalid component check/);
});

test('functional sign-off needs proof and does not promote historical credit', () => {
  const data = catalogue(), manor = data.features.find(f => f.id === 'dungeons:manor-of-the-immortals');
  manor.audit.checks[0].status = 'verified';
  assert.throws(() => validateCatalogue(data), /Missing functional proof/);
  for (const c of manor.audit.checks) { c.status = 'verified'; c.proof = 'Reviewed native actions and regression assertions'; }
  assert.equal(needsWork(manor), false);
  assert.equal(validateCatalogue(data).percent, '0.7%');
  manor.stage = 2; manor.audit.historical = 'verified'; manor.audit.unknowns = []; manor.audit.checks[0].status = 'verify';
  assert.throws(() => validateCatalogue(data), /Unverified components/);
});

test('current-runtime chat badge verification remains unresolved', () => {
  const data = catalogue();
  const chat = data.features.find(f => f.id === 'social:chat');
  assert.ok(chat.audit.unknowns.some(question => /current launcher-pinned runtime.*chat-star badges/.test(question)));
});

test('restoration keeps historical references, not our implementation snapshots', () => {
  const data = catalogue();
  validateCatalogue(data);
  assert.deepEqual(Object.keys(data.scope), ['target']);
  for (const f of data.features) {
    assert.equal(Object.hasOwn(f.audit, 'observed'), false);
    assert.equal(Object.hasOwn(f.audit, 'verification'), false);
  }
  for (const url of [
    'https://github.com/OpenRotMG/Open-RotMG-Server/blob/' + 'a'.repeat(40) + '/src/world.rs',
    'https://github.com/dginovker/Open-RotMG-Server/blob/' + 'a'.repeat(40) + '/src/world.rs',
    'https://openrotmg.org/restoration/proof.html',
  ]) assert.throws(() => validateSources([{ url, label: 'Implementation' }], 'probe'), /not a historical source/);
});
