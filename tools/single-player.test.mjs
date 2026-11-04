import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

test('single-player is an honest preview with zero installer links and the actual source repository', async () => {
  const html = await readFile(new URL('../public/single-player/index.html', import.meta.url), 'utf8');
  assert.match(html, /Preview only\. There is no single-player download available yet\./);
  assert.match(html, /Linux x64, Windows x64 and Apple Silicon Mac/);
  assert.match(html, /Installers will be unsigned/);
  assert.match(html, /launcher features are not released yet/);
  assert.match(html, /new local password/);
  assert.match(html, /full local backups and restores/);
  assert.match(html, /updates paired with compatible save data/);
  assert.doesNotMatch(html, /\bdownload[=>]|releases\/download|releases\/latest|\.exe|\.dmg|\.AppImage|\u2014/);
  const externalLinks = [...html.matchAll(/href="(https?:[^"{]+)"/g)].map(match => match[1]);
  assert.deepEqual(externalLinks, ['https://github.com/OpenRotMG/Open-RotMG-Single-Player']);
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
