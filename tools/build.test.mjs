import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = overrides => spawnSync(process.execPath, ['tools/build.mjs'], {
  cwd: root, env: { ...process.env, ...overrides }, encoding: 'utf8'
});

test('missing deployment URL fails instead of guessing a domain', () => {
  const result = build({ SITE_URL: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SITE_URL is required/);
});

test('public HTTP and credentials in canonical URL are rejected', () => {
  for (const SITE_URL of ['http://example.test/', 'https://user:password@example.test/']) {
    const result = build({ SITE_URL });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must use HTTPS|without credentials/);
  }
});

test('site builds with real HTML metadata and exact preserved client bytes', () => {
  const result = build({});
  assert.equal(result.status, 0, result.stderr);
  const site = new URL(process.env.SITE_URL);
  if (!site.pathname.endsWith('/')) site.pathname += '/';
  const home = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const about = readFileSync(new URL('../dist/about/index.html', import.meta.url), 'utf8');
  for (const html of [home, about]) {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<h1[ >]/);
    assert.match(html, /name="description"/);
    assert.match(html, /property="og:image"/);
    assert.ok(!html.includes('{{'), 'Unresolved template token');
    assert.ok(!html.includes('\u2014'), 'Em dash in authored public copy');
  }
  assert.ok(home.includes(`rel="canonical" href="${site.href}"`));
  assert.ok(about.includes(`rel="canonical" href="${site.href}about/"`));
  assert.ok(home.includes('Multiplayer is not online yet.'));
  for (const html of [home, about]) {
    assert.ok(html.includes('Open RotMG'));
    assert.doesNotMatch(html.replaceAll('https://github.com/OpenRotMG', ''), /OpenRotMG/);
  }
  assert.ok(home.includes('href="https://github.com/OpenRotMG">Source</a>'));
  assert.equal(home.match(/Powered by Ruffle/g)?.length, 1);
  assert.doesNotMatch(home.match(/<footer>(.*?)<\/footer>/s)[1], /Powered by Ruffle/);
  assert.ok(about.includes('Open RotMG is an authentic recreation of Realm of the Mad God as it was in 2012. No custom content, no donations, all open source. Development is from passionate players.'));
  assert.doesNotMatch(about, /The client comes first|Reconstructing the game|class="disclaimer"|github.com\/OpenRotMG\/(website|client|server)/);
  assert.equal(JSON.parse(home.match(/type="application\/ld\+json">(.*?)<\/script>/s)[1]).url, site.href);
  const robots = readFileSync(new URL('../dist/robots.txt', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(robots.includes(`Sitemap: ${site.href}sitemap.xml`));
  assert.ok(sitemap.includes(`<loc>${site.href}</loc>`));
  assert.ok(sitemap.includes(`<loc>${site.href}about/</loc>`));
  const lock = JSON.parse(readFileSync(new URL('../client-lock.json', import.meta.url), 'utf8'));
  const swf = readFileSync(new URL('../dist/client/123.5.1.swf', import.meta.url));
  assert.equal(createHash('sha256').update(swf).digest('hex'), lock.swfSha256);
  const social = readFileSync(new URL('../dist/social.png', import.meta.url));
  assert.equal(social.readUInt32BE(16), 1200);
  assert.equal(social.readUInt32BE(20), 630);
});

test('branded loading screen stays until Ruffle resolves', async () => {
  let finish;
  let options;
  const ready = new Promise(resolve => { finish = resolve; });
  const nodes = { '#game': { dataset: {}, append() {} }, '#startup': { hidden: false } };
  const player = { ruffle: () => ({ load: config => { options = config; return ready; } }) };
  const boot = runInNewContext(readFileSync(new URL('../public/game.js', import.meta.url), 'utf8'), {
    window: { RufflePlayer: { newest: () => ({ createPlayer: () => player }) } },
    document: { baseURI: 'https://example.test/', querySelector: selector => nodes[selector] }, URL
  });
  assert.equal(options.splashScreen, false);
  assert.equal(nodes['#startup'].hidden, false);
  finish();
  await boot;
  assert.equal(nodes['#startup'].hidden, true);
  assert.equal(nodes['#game'].dataset.loaded, 'true');
});

test('startup failure shows an error instead of leaving the branding stuck', async () => {
  const nodes = { '#startup': { hidden: false }, '#load-error': { hidden: true } };
  const errors = [];
  await runInNewContext(readFileSync(new URL('../public/game.js', import.meta.url), 'utf8'), {
    window: {}, document: { querySelector: selector => nodes[selector] },
    console: { error: (...args) => errors.push(args) }
  });
  assert.equal(nodes['#startup'].hidden, true);
  assert.equal(nodes['#load-error'].hidden, false);
  assert.match(nodes['#load-error'].textContent, /Pinned Ruffle runtime did not load/);
  assert.equal(errors.length, 1);
});
