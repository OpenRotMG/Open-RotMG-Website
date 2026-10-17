import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogue, validateSources } from '../public/restoration/catalogue.js';

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
