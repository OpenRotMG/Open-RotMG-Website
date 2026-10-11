import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
