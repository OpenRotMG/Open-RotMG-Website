import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogue, percentage } from '../public/restoration/catalogue.js';

const catalogue = () => JSON.parse(readFileSync(new URL('../public/restoration/progress.json', import.meta.url), 'utf8'));

test('reviewed player catalogue retains its membership and gates', () => {
  const data = catalogue();
  assert.deepEqual(validateCatalogue(data), { e: 4, v: 2, n: 209, percent: '1.4%' });
  assert.equal(data.features.filter(f => f.category === 'conditions').length, 26);
  assert.equal(data.features.filter(f => f.category === 'dungeons').length, 16);
  assert.equal(percentage([{ stage: 0 }, { stage: 1 }, { stage: 2 }]), '50%');
  assert.equal(data.scope.candidate_features[0].scored, false);
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
