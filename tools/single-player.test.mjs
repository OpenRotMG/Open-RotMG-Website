import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

test('single-player links the qualified fixed-version portable ZIPs', async () => {
  const html = await readFile(new URL('../public/single-player/index.html', import.meta.url), 'utf8');
  const repo = 'https://github.com/OpenRotMG/Open-RotMG-Single-Player';
  const externalLinks = [...html.matchAll(/href="(https?:[^"{]+)"/g)].map(match => match[1]);
  assert.deepEqual(externalLinks, [
    ...['win32-x64', 'darwin-arm64', 'linux-x64'].map(target => `${repo}/releases/download/v0.1.5/openrotmg-singleplayer-0.1.5-${target}.zip`),
  ]);
  assert.match(html,/Update and reopen/);assert.match(html,/one-time upgrade adds automatic launcher updates/);assert.match(html,/keep the old folder until your progress is confirmed/);
  assert.match(html,/Account management lets you view saved passwords and change local logins/);assert.match(html,/Saves and backups stay in player data/);
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
