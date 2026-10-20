import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogue, validateSources, needsImplementation } from '../public/restoration/catalogue.js';

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
    ['dungeons:spider-den', 'present', 0],
    ['dungeons:forbidden-jungle', 'present', 0],
    ['dungeons:manor-of-the-immortals', 'present', 0],
    ['realm:great-coil-snake', 'present', 0],
    ['realm:kage-kami', 'present', 0],
    ['realm:find-your-next-quest', 'present', 0],
    ['condition:24', 'present', 0],
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
  assert.equal(needsImplementation(byId('dungeons:manor-of-the-immortals')), false);
  const recovery = byId('access:account-recovery');
  assert.equal(needsImplementation(recovery), false);
  assert.equal(recovery.audit.historical, 'known-differences');
  assert.match(recovery.audit.differences.join(' '), /intentionally replaces/);
  for (const id of ['heroes:fame-bonuses', 'gear:seasonal-toys', 'dungeons:undead-lair', 'realm:wasp-queen', 'realm:great-lizard', 'realm:shambling-sludge']) {
    const feature = byId(id);
    assert.equal(feature.audit.implementation, 'partial', id);
    assert.equal(needsImplementation(feature), true, id);
    assert.ok(feature.audit.differences.length, id);
  }
  assert.match(byId('heroes:fame-bonuses').audit.differences.join(' '), /Only Well Equipped.*other named death bonuses/);
  assert.match(byId('gear:seasonal-toys').audit.differences.join(' '), /Firecrackers work.*Sand Castle/);
  assert.match(byId('dungeons:undead-lair').audit.differences.join(' '), /does not explicitly mark/);
  assert.doesNotMatch(byId('access:server-selection').audit.differences.join(' '), /usage.*zero/i);
  for (const id of ['dungeons:tomb-of-the-ancients', 'dungeons:davy-jones-s-locker', 'dungeons:mad-lab', 'dungeons:beachzone']) assert.equal(byId(id).audit.implementation, 'missing', id);
  assert.equal(validateCatalogue(data).work, data.features.filter(needsImplementation).length);
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
