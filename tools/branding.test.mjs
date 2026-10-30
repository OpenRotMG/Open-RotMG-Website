import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/branding/copy.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/branding/index.html', import.meta.url), 'utf8');

async function click(id, clipboard, field) {
  const status = {};
  const errors = [];
  let handler;
  let appended;
  const button = { dataset: { copy: id }, addEventListener: (_, fn) => { handler = fn; }, closest: () => ({ append: node => { appended = node; } }) };
  runInNewContext(script, {
    document: { getElementById: key => key === 'copy-status' ? status : field, querySelectorAll: () => [button] },
    navigator: { clipboard }, console: { error: (...args) => errors.push(args) }
  });
  await handler();
  assert.equal(appended, status);
  return { status, errors };
}

test('favicon exports retain reviewed pixel-aligned artwork at their advertised sizes', () => {
  // Pin the reviewed exports so a smoothing filter cannot silently blend the sprite's pixels.
  for (const [size, hash] of [
    [16, '96deb1d325ea8e82bfbd1b430f2e320a98bc4ee046eaba2c75d70aa8740d3029'],
    [32, 'c8e6e65141c0f71db5025e03ea1557f9c7286708c8dd5f2aa40340c231ea6ab5'],
    [48, '9ac7bcb99afc2b7d684c27e76634d4785ab93c1c910af67f883de86ef80a4687'],
    [96, '371a75efc3ff41ffed31cac1cad1fa97e93feb0749b553ba35caf5282eb31461'],
    [192, '9dda6b691afc29890363e294052c2f3c5f83b1aa346a1d65178a61d52a8f707c']
  ]) {
    const png = readFileSync(new URL(`../public/icons/amulet-${size}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(createHash('sha256').update(png).digest('hex'), hash);
  }
});

test('every copy control points to a unique readable field', () => {
  const ids = [...html.matchAll(/data-copy="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 11);
  assert.doesNotMatch(html, /discourse-code|Post on Discourse|Forum embed|Lost City|Images for sharing/);
  for (const id of ids) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
    assert.match(html, new RegExp(`(?:input|textarea) id="${id}" readonly`));
  }
});

test('image URL controls copy the exact field value', async () => {
  for (const [, id] of html.matchAll(/data-copy="([^"]+)"/g)) {
    const value = html.match(new RegExp(`<input id="${id}" readonly value="([^"]+)"`))[1].replaceAll('{{SITE_URL}}', 'https://openrotmg.org/');
    const writes = [];
    const { status, errors } = await click(id, { writeText: async text => { writes.push(text); } }, { value });
    assert.deepEqual(writes, [value]);
    assert.equal(status.textContent, 'Image URL copied.');
    assert.equal(errors.length, 0);
  }
});

test('six historical screenshots have downloads, direct URLs and dated source credits', () => {
  const captures = [
    ['godlands-train-2012', 1314, 1080, 'Vyvum_qPaw8', 130, '2012-03-19'],
    ['godlands-bullet-hell-2012', 960, 720, 'p0oD-0YdM_c', 200, '2012-04-27'],
    ['oryx-wine-cellar-2012', 1440, 1080, 'trj_Xvxf5Go', 50, '2012-06-28'],
    ['oryx-wine-cellar-party-2012', 1440, 1080, 'trj_Xvxf5Go', 22, '2012-06-28'],
    ['mad-lab-2012', 628, 480, 'xyUiQewDLg8', 130, '2012-09-16'],
    ['mad-lab-party-2012', 628, 480, 'xyUiQewDLg8', 205, '2012-09-16']
  ];
  for (const [name, width, height, video, seconds, date] of captures) {
    const png = readFileSync(new URL(`../public/branding/screenshots/${name}.png`, import.meta.url));
    assert.equal(png.readUInt32BE(16), width);
    assert.equal(png.readUInt32BE(20), height);
    assert.ok(html.includes(`href="screenshots/${name}.png" download`));
    assert.ok(html.includes(`value="{{SITE_URL}}branding/screenshots/${name}.png"`));
    assert.ok(html.includes(`https://www.youtube.com/watch?v=${video}&amp;t=${seconds}s`));
    assert.ok(html.includes(`${date} upload`));
  }
});

test('denied or unavailable clipboard and missing field report visible errors', async () => {
  for (const [clipboard, field, message] of [
    [undefined, { value: 'url' }, /HTTPS and browser permission/],
    [{ writeText: async () => { throw new Error('Permission denied'); } }, { value: 'url' }, /Permission denied/],
    [{ writeText: async () => assert.fail('Missing field must not copy') }, null, /Missing copy field/]
  ]) {
    const { status, errors } = await click('banner-url', clipboard, field);
    assert.match(status.textContent, /^Copy failed:/);
    assert.match(status.textContent, message);
    assert.equal(errors.length, 1);
  }
});
