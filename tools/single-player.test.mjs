import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

test('single-player links the qualified fixed-version installers and states save and unsigned boundaries', async () => {
  const html = await readFile(new URL('../public/single-player/index.html', import.meta.url), 'utf8');
  const repo = 'https://github.com/OpenRotMG/Open-RotMG-Single-Player';
  const externalLinks = [...html.matchAll(/href="(https?:[^"{]+)"/g)].map(match => match[1]);
  assert.deepEqual(externalLinks, [
    ...['linux-x64.zip', 'win32-x64.msi', 'darwin-arm64.dmg'].map(target => `${repo}/releases/download/v0.1.0/openrotmg-0.1.0-${target}`),
    `${repo}/releases/tag/v0.1.0`, repo,
  ]);
  for (const boundary of ['new local password', 'full local backups', 'verify a local backup before migrating save data', 'not updates to the launcher', 'does not upload your progress', 'unsigned', 'Intel Mac is not supported', 'Do not disable operating-system security protections', 'corresponding source archives']) {
    assert.ok(html.includes(boundary), boundary);
  }
  assert.doesNotMatch(html, /Preview only|planned edition|not released yet|releases\/latest|\u2014/);
  const about = await readFile(new URL('../public/about/index.html', import.meta.url), 'utf8');
  assert.match(about, /Download the offline edition\./);
});

test('new pages use distinct native-art 1200x630 cards and preserve the original About card bytes', async () => {
  const hashes = [];
  for (const page of ['export', 'single-player', 'about']) {
    const png = await readFile(new URL(`../public/${page}/social.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    hashes.push(createHash('sha256').update(png).digest('hex'));
    const html = await readFile(new URL(`../public/${page}/index.html`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /\u2014/);
  }
  assert.equal(new Set(hashes).size, 3);
  assert.equal(hashes[2], '373c775b807c8a1af013595686711c52e063207f6fe3dcc8a11b50237139cc52');
});
