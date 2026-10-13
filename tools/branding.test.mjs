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
  assert.equal(ids.length, 5);
  assert.doesNotMatch(html, /discourse-code|Post on Discourse|Forum embed|Lost City|Images for sharing/);
  for (const id of ids) {
    assert.equal([...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length, 1);
    assert.match(html, new RegExp(`(?:input|textarea) id="${id}" readonly`));
  }
});

test('image URL controls copy the exact field value', async () => {
  for (const id of ['banner-url', 'mobile-url', 'oryx-url', 'social-url', 'icon-url']) {
    const value = html.match(new RegExp(`<input id="${id}" readonly value="([^"]+)"`))[1].replaceAll('{{SITE_URL}}', 'https://openrotmg.org/');
    const writes = [];
    const { status, errors } = await click(id, { writeText: async text => { writes.push(text); } }, { value });
    assert.deepEqual(writes, [value]);
    assert.equal(status.textContent, 'Image URL copied.');
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
