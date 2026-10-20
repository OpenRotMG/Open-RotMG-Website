import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const script = readFileSync(new URL('../public/2010/preview.js', import.meta.url), 'utf8');

for (const href of ['https://www.openrotmg.org/2010/', 'https://www.openrotmg.org/2010/index.html', 'https://openrotmg.org/2010/', 'https://openrotmg.org/2010/index.html', 'http://127.0.0.1:18924/2010/']) {
  test(`2010 assets and game socket remain isolated under ${href}`, async () => {
    const location = new URL(href);
    const status = {};
    let config;
    let appended = 0;
    const player = { ruffle: () => ({ load: async options => { config = options; } }) };
    await runInNewContext(script, {
      URL, location,
      window: { RufflePlayer: { newest: () => ({ createPlayer: () => player }) } },
      document: { querySelector: selector => selector === '#status' ? status : { append: value => { assert.equal(value, player); appended++; } } },
      console: { error: error => { throw error; } }
    });
    assert.equal(appended, 1);
    assert.equal(config.url, `${location.origin}/2010/client-data-repaired.swf`);
    assert.equal(config.socketProxy[0].proxyUrl, `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/2010/game`);
    assert.equal(config.allowScriptAccess, false);
    assert.equal(config.openUrlMode, 'deny');
    for (const url of ['http://www.realmofthemadgod.com/char/list', 'http://realmofthemadgod.appspot.com/char/list', 'http://rotmgtesting.appspot.com/servers.txt']) {
      const rule = config.urlRewriteRules.find(([pattern]) => pattern.test(url));
      assert.ok(rule);
      assert.ok(url.replace(rule[0], rule[1]).startsWith(`${location.origin}/2010/legacy/`));
    }
  });
}

test('2010 entry labels its limits and preserves an unchanged client download', () => {
  const html = readFileSync(new URL('../public/2010/index.html', import.meta.url), 'utf8');
  assert.match(html, /not authenticated original balance/);
  assert.match(html, /Characters and saves are separate/);
  assert.match(html, /href="original-client.swf" download/);
  assert.ok(html.includes('href="https://github.com/dginovker/Open-RotMG-Server/tree/3d70257721c4d24225c91bbc2273cf676b234f8a">Source</a>'));
  assert.match(html, /src="vendor\/ruffle.js"/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.openrotmg\.org\/2010\/"/);
  assert.doesNotMatch(html, /\u2014|'unsafe-eval'|objects\.xml|grounds\.xml/);
});

test('2010 load failures remain visible instead of loading another revision', async () => {
  const status = {};
  const errors = [];
  await runInNewContext(script, {
    URL, location: new URL('https://openrotmg.org/2010/'),
    window: { RufflePlayer: { newest: () => ({ createPlayer: () => ({ ruffle: () => ({ load: async () => { throw new Error('asset unavailable'); } }) }) }) } },
    document: { querySelector: selector => selector === '#status' ? status : { append() {} } },
    console: { error: error => errors.push(error) }
  });
  assert.match(status.textContent, /2010 preview failed to load: asset unavailable/);
  assert.equal(errors.length, 1);
});
