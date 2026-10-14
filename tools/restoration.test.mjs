import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogue, percentage } from '../public/restoration/catalogue.js';

const catalogue = () => JSON.parse(readFileSync(new URL('../public/restoration/progress.json', import.meta.url), 'utf8'));

test('reviewed player catalogue retains its membership and gates', () => {
  const data = catalogue();
  assert.deepEqual(validateCatalogue(data), { e: 10, v: 9, n: 209, percent: '4.5%' });
  assert.equal(data.features.filter(f => f.category === 'conditions').length, 26);
  assert.equal(data.features.filter(f => f.category === 'dungeons').length, 16);
  assert.equal(percentage([{ stage: 0 }, { stage: 1 }, { stage: 2 }]), '50%');
  assert.equal(data.scope.candidate_features[0].scored, false);
  for (const id of ['realm:travel-between-worlds', 'social:trade-with-players', 'access:character-persistence', 'access:reconnect-safely']) {
    const feature = data.features.find(f => f.id === id);
    assert.equal(feature.stage, 2, id);
    assert.ok(feature.evidence.links.includes('https://github.com/OpenRotMG/Open-RotMG-Server/pull/19'), id);
  }
  for (const id of ['dungeons:pirate-cave', 'home:nexus', 'home:vault', 'gear:loot-and-ownership', 'heroes:level-to-20']) {
    const feature = data.features.find(f => f.id === id);
    assert.equal(feature.stage, 0, id);
    assert.equal(feature.development, true, id);
  }
  assert.equal(data.features.find(f => f.id === 'heroes:choose-and-unlock-classes').stage, 1);
  for (const id of ['access:guest-accounts', 'access:registration', 'access:login']) {
    const feature = data.features.find(f => f.id === id);
    assert.equal(feature.stage, 2, id);
    assert.ok(feature.evidence.links.includes('https://github.com/OpenRotMG/Open-RotMG-Server/pull/21'), id);
  }
  for (const id of ['heroes:priest', 'social:teleport-to-players', 'social:chat', 'home:choose-your-name', 'heroes:legends-highscores', 'realm:realm-generation']) {
    const feature = data.features.find(f => f.id === id);
    assert.equal(feature.stage, 0, id);
    assert.equal(feature.development, true, id);
    assert.ok(feature.evidence.reference, id);
  }
});

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

test('merged pause, conditions and social work stays development-only', () => {
  const data = catalogue();
  for (const [id, pr] of [
    ['condition:21', 29],
    ...[4, 6, 7, 14, 15].map(n => [`condition:${n}`, 30]),
    ...['chat', 'whispers', 'lock-players', 'ignore-players'].map(name => [`social:${name}`, 31])
  ]) {
    const feature = data.features.find(f => f.id === id);
    assert.equal(feature.stage, 0, id);
    assert.equal(feature.development, true, id);
    assert.equal(feature.evidence.verification, null, id);
    assert.ok(feature.evidence.links.includes(`https://github.com/OpenRotMG/Open-RotMG-Server/pull/${pr}`), id);
    assert.match(feature.evidence.reference, /[Nn]ative .*unverified/, id);
  }
  for (const n of [4, 6, 7, 14]) {
    const reference = data.features.find(f => f.id === `condition:${n}`).evidence.reference;
    assert.match(reference, /player-only condition mechanics/);
    assert.match(reference, /prepared fixtures; current naturally spawned enemies do not apply this condition/);
  }
  assert.match(data.features.find(f => f.id === 'condition:15').evidence.reference, /no supported naturally earned Speedy grant/i);
  assert.match(data.features.find(f => f.id === 'social:whispers').evidence.reference, /2013 reference/);
  assert.doesNotMatch(data.features.find(f => f.id === 'social:chat').evidence.reference, /Slash commands are rejected/);
  assert.match(data.features.find(f => f.id === 'heroes:level-to-20').evidence.reference, /PR #19 already implements random, per-class stat gains/);
  assert.deepEqual(validateCatalogue(data), { e: 10, v: 9, n: 209, percent: '4.5%' });
});

test('restoration links the dated historical ledger without changing the dialogs', () => {
  const page = readFileSync(new URL('../public/restoration/index.html', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../docs/historical-features.md', import.meta.url), 'utf8');
  assert.ok(page.includes('docs/historical-features.md'));
  assert.ok(page.includes('Native visuals and full historical contracts remain unverified'));
  assert.doesNotMatch(page, /feature-proof|development-note/);
  assert.match(ledger, /Last checked: \*\*\d{4}-\d{2}-\d{2}\*\*/);
  for (const name of ['native `/lefttomax`', 'seven-dose elixirs']) {
    const entry = ledger.split('\n').find(line => line.includes(name));
    assert.ok(entry, name);
    assert.match(entry, /^- \*\*Unresolved:\*\*/);
  }
});

test('missing proof, invalid stages, duplicate IDs and tampered totals fail closed', () => {
  for (const [mutate, error] of [
    [d => { d.features[0].stage = 3; }, /Invalid feature/],
    [d => { d.features[0].id = d.features[1].id; }, /Duplicate catalogue identifiers/],
    [d => { d.features.find(f => f.stage).evidence = null; }, /Missing reference/],
    [d => { d.features.find(f => f.stage === 2).evidence.verification = ''; }, /Missing verification/],
    [d => { d.features[0].requirements = ['']; }, /Invalid requirements/],
    [d => { d.scope.percent = 99; }, /Catalogue totals do not match/],
    [d => { d.scope.earned = 99; }, /Catalogue totals do not match/],
    [d => { d.categories.push({ id: 'empty', name: 'Empty', icon: 'missing.png' }); }, /Empty category/]
  ]) {
    const data = catalogue();
    mutate(data);
    assert.throws(() => validateCatalogue(data), error);
  }
  assert.throws(() => validateCatalogue(null), /Invalid catalogue/);
});
