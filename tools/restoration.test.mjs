import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateCatalogue, percentage, auditCounts } from '../public/restoration/catalogue.js';

const catalogue = () => JSON.parse(readFileSync(new URL('../public/restoration/progress.json', import.meta.url), 'utf8'));
function fixture() {
  return {
    scope: { target: '123.5.1', features: 1, research_accepted: 1, implementation_verified: 1, earned: 2, possible: 2, percent: 100,
      audit: { date: '2026-10-17', server: 'a'.repeat(40), client: 'b'.repeat(40), baseline_website: 'c'.repeat(40), verification: 'Synthetic fixture checks.' }, dispositions: [] },
    categories: [{ id: 'fixture', name: 'Test fixture', icon: 'fixture.png' }],
    features: [{ id: 'fixture:feature', name: 'Synthetic unit-test feature', category: 'fixture', icon: null, stage: 2,
      audit: { implementation: 'present', historical: 'verified', expected: 'Fixture rule.', observed: 'Fixture match.', verification: 'Synthetic test evidence, not a game assertion.', differences: [], unknowns: [],
        sources: ['historical', 'implementation', 'verification'].map(kind => ({ url: `https://example.test/${kind}`, kind, passage: 'Synthetic fixture citation.' })) } }]
  };
}

test('audit schema derives counts without equating implementation with fidelity', () => {
  const data = fixture();
  assert.deepEqual(validateCatalogue(data), { e: 1, v: 1, n: 1, percent: '100%' });
  data.features[0].audit.historical = 'known-differences';
  data.features[0].audit.differences = ['Synthetic documented discrepancy.'];
  data.features[0].stage = 1;
  Object.assign(data.scope, { implementation_verified: 0, earned: 1, percent: 50 });
  assert.equal(validateCatalogue(data).percent, '50%');
  const counts = auditCounts(data.features);
  assert.equal(counts.implementation.present, 1);
  assert.equal(counts.historical.verified, 0);
  assert.equal(counts.historical['known-differences'], 1);
  assert.equal(percentage([{ stage: 0 }, { stage: 1 }, { stage: 2 }]), '50%');
});

test('audit schema rejects unsupported verdicts, unsafe sources and invented totals', () => {
  for (const [mutate, error] of [
    [d => { d.scope.target = '7.0'; }, /Unexpected restoration target/],
    [d => { delete d.scope.audit; }, /Invalid audit snapshot/],
    [d => { d.features[0].stage = 3; }, /Invalid feature/],
    [d => { d.features[0] = null; }, /Invalid catalogue entry/],
    [d => { d.features.push(structuredClone(d.features[0])); }, /Duplicate catalogue identifiers/],
    [d => { d.features[0].audit.implementation = 'probably'; }, /Invalid audit status/],
    [d => { d.features[0].audit.historical = 'complete'; }, /Invalid audit status/],
    [d => { d.features[0].audit.sources = []; }, /Missing reference/],
    [d => { d.features[0].audit.sources = d.features[0].audit.sources.filter(s => s.kind !== 'verification'); }, /Missing verification/],
    [d => { d.features[0].audit.expected = ''; }, /Incomplete audit/],
    [d => { d.features[0].audit.sources[0].passage = ''; }, /Invalid citation/],
    [d => { d.features[0].audit.sources[0].url = 'javascript:alert(1)'; }, /Unsafe citation URL/],
    [d => { d.features[0].audit.sources[0].url = 'https://user:secret@example.test/'; }, /Unsafe citation URL/],
    [d => { d.features[0].audit.sources[0].url = 'https://example.test/?token=private'; }, /Sensitive citation URL/],
    [d => { d.features[0].audit.sources[0].url = 'not a URL'; }, /Invalid citation URL/],
    [d => { d.features[0].audit.sources[0].url = 'https://github.com/OpenRotMG/Open-RotMG-Server/blob/main/src/world.rs'; }, /Unpinned GitHub citation/],
    [d => { d.features[0].audit.sources[0].url = 'https://github.com/OpenRotMG/Open-RotMG-Server/blob/69b40eeab0d53be6c6e1f9ff4527ed71e0527ed71e052a23c/src/world.rs'; }, /Unpinned GitHub citation/],
    [d => { d.features[0].audit.unknowns = ['Not established.']; }, /Unsupported verified verdict/],
    [d => { d.features[0].audit.differences = ['Does not match.']; }, /Unsupported verified verdict/],
    [d => { d.features[0].audit.implementation = 'partial'; }, /Unsupported verified verdict/],
    [d => { d.features[0].audit.historical = 'partial'; }, /Unsupported verified verdict/],
    [d => { d.features[0].stage = 0; d.features[0].audit.historical = 'known-differences'; }, /Missing discrepancy/],
    [d => { d.scope.percent = 99; }, /Catalogue totals do not match/],
    [d => { d.categories.push({ id: 'empty', name: 'Empty', icon: '' }); }, /Empty category/],
    [d => { d.scope.dispositions = [{ name: 'Candidate', reason: 'Fixture reason', disposition: 'covered', covered_by: ['absent:id'], sources: [] }]; }, /Invalid scope disposition/],
    [d => { d.scope.dispositions = [{ name: 'Candidate', reason: 'Fixture reason', disposition: 'add', covered_by: [], sources: [] }]; }, /Unmapped scope disposition/]
  ]) {
    const data = fixture(); mutate(data); assert.throws(() => validateCatalogue(data), error);
  }
  assert.throws(() => validateCatalogue(null), /Invalid catalogue/);
});

test('published audit has a disposition and traceable basis for every feature', () => {
  const data = catalogue(), result = validateCatalogue(data), counts = auditCounts(data.features);
  assert.equal(data.scope.target, '123.5.1');
  assert.equal(Object.values(counts.implementation).reduce((a, b) => a + b, 0), result.n);
  assert.equal(Object.values(counts.historical).reduce((a, b) => a + b, 0), result.n);
  assert.equal(counts.historical.verified, result.v);
  assert.ok(data.scope.dispositions.length > 0);
  // Scope edits must account for old entries rather than silently losing them.
  const added = new Set(data.scope.dispositions.filter(d => d.disposition === 'add').flatMap(d => d.covered_by));
  const original = data.features.filter(f => !added.has(f.id)).map(f => f.id);
  original.push(...data.scope.dispositions.filter(d => ['merge', 'exclude'].includes(d.disposition) && d.id !== undefined).map(d => d.id));
  assert.equal(new Set(original).size, 209);
  assert.equal(createHash('sha256').update(original.sort().join('\n')).digest('hex'), '25e16012aec0d6e31a8ae73771dca84098a283f15ce0a6e99a1c1ae098cf357b');
  for (const f of data.features) {
    assert.ok(f.audit.sources.every(s => !/\/home\/|\/tmp\/|credentials|profile\//i.test(s.url)), f.id);
    assert.ok(!/\u2014/.test(JSON.stringify(f.audit)), f.id);
  }
  const guild = data.features.find(f => f.id === 'social:guild-roster');
  assert.ok(['present', 'partial'].includes(guild.audit.implementation));
  assert.doesNotMatch(guild.audit.expected, /original guild history and recorded actions/i);
  for (const id of ['heroes:gravestones', 'access:character-deletion', 'home:buy-from-merchants']) {
    assert.ok(['present', 'partial'].includes(data.features.find(f => f.id === id).audit.implementation), id);
  }
});

test('original sprite assets and catalogue identities remain inspectable', () => {
  const data = catalogue(), icons = Object.fromEntries(data.categories.map(c => [c.id, c.icon]));
  assert.notEqual(icons.heroes, icons.access);
  assert.equal(icons.access, 'assets/player/client-and-accounts.png');
  assert.equal(icons.social, 'assets/player/chat.png');
  for (const path of Object.values(icons)) {
    const png = readFileSync(new URL(`../public/restoration/${path}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
});

test('website exposes audit statuses, sources and scope rather than a merge-count score', () => {
  const page = readFileSync(new URL('../public/restoration/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/restoration/app.js', import.meta.url), 'utf8');
  assert.match(page, /provisional evidence score/);
  for (const id of ['implementation-summary', 'historical-summary', 'feature-status', 'feature-audit', 'scope-dispositions', 'audit-date']) assert.ok(page.includes(`id="${id}"`), id);
  assert.match(app, /source\.passage/);
  assert.match(app, /a\.unknowns/);
  assert.match(app, /a\.differences/);
  assert.doesNotMatch(app, /innerHTML|f\.development|f\.evidence/);
  assert.match(app, /Cannot load restoration/);
});
