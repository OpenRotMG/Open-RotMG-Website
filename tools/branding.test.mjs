import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

test('every copy control points to a unique readable field', () => {
  const ids = [...html.matchAll(/data-copy="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, 6);
  for (const id of ids) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
    assert.match(html, new RegExp(`(?:input|textarea) id="${id}" readonly`));
  }
  const embed = html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1];
  assert.equal([...embed.matchAll(/&lt;img /g)].length, 5);
  assert.equal([...embed.matchAll(/&lt;a /g)].length, 1);
  assert.match(embed, /&lt;a href="https:\/\/discord.gg\/EwZWNzzYwP"&gt;&lt;img src="{{SITE_URL}}branding\/slices\/discord.png" width="30%" alt="Join Discord"&gt;&lt;\/a&gt;/);
  assert.doesNotMatch(embed, /picture|style=|&gt;\s+&lt;/);
});

test('embed and image URL controls copy the exact field value', async () => {
  for (const id of ['discourse-code', 'banner-url']) {
    const value = id === 'discourse-code' ? html.match(/<textarea[^>]*>(.*?)<\/textarea>/s)[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('{{SITE_URL}}', 'https://openrotmg.org/') : 'https://openrotmg.org/branding/banner.png';
    const writes = [];
    const { status, errors } = await click(id, { writeText: async text => { writes.push(text); } }, { value });
    assert.deepEqual(writes, [value]);
    assert.equal(status.textContent, id === 'discourse-code' ? 'Embed copied.' : 'Image URL copied.');
    assert.equal(errors.length, 0);
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
