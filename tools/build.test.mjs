import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { validateCatalogue } from '../public/restoration/catalogue.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = overrides => spawnSync(process.execPath, ['tools/build.mjs'], {
  cwd: root, env: { ...process.env, ...overrides }, encoding: 'utf8'
});

test('missing deployment URL fails instead of guessing a domain', () => {
  const result = build({ SITE_URL: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SITE_URL is required/);
});

test('public HTTP, credentials and subpaths in canonical URL are rejected', () => {
  for (const SITE_URL of ['http://example.test/', 'https://user:password@example.test/', 'https://example.test/game/']) {
    const result = build({ SITE_URL });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must use HTTPS|without credentials|must be the origin root/);
  }
});

test('site builds with metadata, strict same-origin WSS and preserved reference bytes', () => {
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
  const footer = home.match(/<footer class="site-footer">(.*?)<\/footer>/s)[1];
  assert.ok(footer.includes('2012 Realm of the Mad God reimplementation<br>'));
  assert.ok(footer.includes('Report bugs and missing content on Discord.</p>'));
  assert.doesNotMatch(footer.match(/<p>(.*?)<\/p>/s)[1], /<a[ >]/);
  const footerNav = footer.match(/<nav.*?<\/nav>/s)[0];
  const progress = JSON.parse(readFileSync(new URL('../dist/restoration/progress.json', import.meta.url), 'utf8'));
  const restoration = validateCatalogue(progress);
  assert.ok(footerNav.includes(`<a href="${site.pathname}restoration/">${restoration.percent} complete</a>`));
  assert.ok(footerNav.includes('href="https://discord.gg/EwZWNzzYwP">Discord</a>'));
  assert.doesNotMatch(footer, /<p>2% complete<\/p>/);
  const shareDescription = '2012 is back. Play Realm of the Mad God with your friends.';
  assert.ok(home.includes(`property="og:description" content="${shareDescription}"`));
  assert.ok(home.includes(`name="twitter:description" content="${shareDescription}"`));
  for (const html of [home, about]) {
    assert.ok(html.includes('Open RotMG'));
    assert.doesNotMatch(html.replaceAll('https://github.com/OpenRotMG', ''), /OpenRotMG/);
  }
  assert.ok(home.includes('href="https://github.com/OpenRotMG">Source</a>'));
  assert.equal(home.match(/Powered by Ruffle/g)?.length, 1);
  assert.doesNotMatch(footer, /Powered by Ruffle/);
  assert.ok(about.includes('Open RotMG is an authentic recreation of Realm of the Mad God as it was in 2012. No custom content, no donations, all open source. Development is from passionate players.'));
  assert.doesNotMatch(about, /The client comes first|Reconstructing the game|class="disclaimer"|github.com\/OpenRotMG\/(website|client|server)|multiplayer server is not online/);
  assert.ok(about.includes('supports guest Wizard movement'));
  assert.ok(about.includes(`href="${site.pathname}restoration/">Restoration</a> for progress by feature.`));
  assert.equal(JSON.parse(home.match(/type="application\/ld\+json">(.*?)<\/script>/s)[1]).url, site.href);
  const robots = readFileSync(new URL('../dist/robots.txt', import.meta.url), 'utf8');
  const sitemap = readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  assert.ok(robots.includes(`Sitemap: ${site.href}sitemap.xml`));
  assert.ok(sitemap.includes(`<loc>${site.href}</loc>`));
  assert.ok(sitemap.includes(`<loc>${site.href}about/</loc>`));
  assert.ok(sitemap.includes(`<loc>${site.href}restoration/</loc>`));
  const restorationPage = readFileSync(new URL('../dist/restoration/index.html', import.meta.url), 'utf8');
  assert.ok(restorationPage.includes(`rel="canonical" href="${site.href}restoration/"`));
  assert.ok(restorationPage.includes('<script type="module" src="app.js">'));
  assert.ok(restorationPage.includes(`href="${site.pathname}style.css"`));
  for (const html of [home, about, restorationPage]) {
    assert.equal((html.match(/class="site-shell"/g) ?? []).length, 1);
    assert.equal((html.match(/<nav aria-label="Project">/g) ?? []).length, 1);
    assert.equal((html.match(/class="site-signature"/g) ?? []).length, 1);
    assert.doesNotMatch(html, /site-header|site-nav|client-title\.png|Local design|Local concept/);
    assert.ok(html.includes('<footer class="site-footer">'));
    assert.ok(html.includes('content="#000000"'));
  }
  assert.doesNotMatch(restorationPage, /ring-progress|class="hero"|class="score"/);
  const css = readFileSync(new URL('../dist/style.css', import.meta.url), 'utf8');
  assert.match(css, /overflow-y: scroll/);
  assert.match(css, /width: 850px/);
  assert.match(css, /background: #000/);
  assert.match(css, /color: #cb8585/);
  const restorationCss = readFileSync(new URL('../dist/restoration/style.css', import.meta.url), 'utf8');
  assert.match(restorationCss, /\.forum-list/);
  assert.doesNotMatch(restorationCss, /feature-grid|border-radius/);
  assert.equal(progress.features.length, 209);
  assert.equal(restoration.percent, '1.4%');
  assert.equal(existsSync(new URL('../dist/restoration/audit.html', import.meta.url)), false);
  const lock = JSON.parse(readFileSync(new URL('./client-lock.json', import.meta.url), 'utf8'));
  const swf = readFileSync(resolve(process.env.CLIENT_DIR, 'client.swf'));
  assert.equal(createHash('sha256').update(swf).digest('hex'), lock.swfSha256);
  assert.ok(home.includes(`connect-src 'self' ${site.origin.replace(/^http/, 'ws')};`));
  assert.ok(home.includes(`src="${site.pathname}vendor/ruffle.js"`));
  assert.doesNotMatch(home, /iframe|runtime\/ruffle/);
  assert.equal(existsSync(new URL('../dist/client.swf', import.meta.url)), false);
  assert.equal(existsSync(new URL('../dist/vendor', import.meta.url)), false);
  assert.equal(existsSync(new URL('../dist/local', import.meta.url)), false);
  const social = readFileSync(new URL('../dist/social.png', import.meta.url));
  assert.equal(social.readUInt32BE(16), 1200);
  assert.equal(social.readUInt32BE(20), 630);
  const socialHash = createHash('sha256').update(social).digest('hex');
  assert.equal(socialHash, '243a2d1d875f6539c170e598bcb891476fdf24cae6a3caac52db83a31ae2f0b6');
  const imageUrl = `${site.href}social.png?v=${socialHash.slice(0, 12)}`;
  for (const html of [home, about]) assert.ok(html.includes(`property="og:image" content="${imageUrl}"`));
  assert.ok(home.includes(`name="twitter:image" content="${imageUrl}"`));
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
  assert.equal(options.url, 'https://example.test/client.swf');
  assert.equal(options.socketProxy[0].proxyUrl, 'wss://example.test/game');
  assert.equal(options.socketProxy[0].host, '127.0.0.1');
  assert.equal(options.socketProxy[0].port, 2050);
  assert.equal(options.urlRewriteRules[0][1], 'https://example.test/legacy-api/');
  assert.equal(options.urlRewriteRules[1][1], 'https://example.test/sfx/');
  assert.equal(nodes['#startup'].hidden, false);
  finish();
  await boot;
  assert.equal(nodes['#startup'].hidden, true);
  assert.equal(nodes['#game'].dataset.loaded, 'true');
});

test('legacy API rewrites leave same-origin game assets alone on port 8080', async () => {
  for (const port of [8080, 18923, 65535]) {
    const origin = `http://127.0.0.1:${port}`;
    let options;
    const nodes = { '#game': { dataset: {}, append() {} }, '#startup': { hidden: false } };
    const player = { ruffle: () => ({ load: config => { options = config; return Promise.resolve(); } }) };
    await runInNewContext(readFileSync(new URL('../public/game.js', import.meta.url), 'utf8'), {
      window: { RufflePlayer: { newest: () => ({ createPlayer: () => player }) } },
      document: { baseURI: origin + '/', querySelector: selector => nodes[selector] }, URL
    });
    const rewrite = url => options.urlRewriteRules.reduce((url, [pattern, replacement]) => url.replace(pattern, replacement), url);
    for (const path of ['client.swf', 'vendor/ruffle.js', 'legacy-api/char/list', 'game', 'health']) {
      assert.equal(rewrite(`${origin}/${path}`), `${origin}/${path}`);
    }
    for (const path of ['char/list', 'char/fame']) {
      assert.equal(rewrite(`http://127.0.0.1:8080/${path}`), `${origin}/legacy-api/${path}`);
    }
    assert.equal(rewrite(options.url), options.url);
  }
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
