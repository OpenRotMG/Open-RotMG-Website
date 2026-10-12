import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localEndpoint, startLocalClient } from '../public/local/local.js';

function environment(fetch, load = async () => {}) {
  const previous = Object.fromEntries(['window', 'document', 'location'].map(key => [key, globalThis[key]]));
  const nodes = Object.fromEntries(['status', 'log', 'error', 'error-message', 'game'].map(id => [id, { textContent: '', hidden: true, dataset: {}, append() {} }]));
  let options;
  class Socket extends EventTarget {
    close() { this.dispatchEvent(Object.assign(new Event('close'), { code: 1000, wasClean: true, reason: '' })); }
  }
  globalThis.location = { href: 'https://openrotmg.org/local/#port=18923', origin: 'https://openrotmg.org', hash: '#port=18923' };
  globalThis.document = { getElementById: id => nodes[id] };
  globalThis.window = {
    fetch, WebSocket: Socket,
    RufflePlayer: { newest: () => ({ createPlayer: () => ({ ruffle: () => ({ load: config => { options = config; return load(config); } }) }) }) }
  };
  return { nodes, options: () => options, restore: () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  } };
}

test('target is an explicit loopback port, never an arbitrary server or production', () => {
  assert.equal(localEndpoint('#port=18923').href, 'http://127.0.0.1:18923/');
  for (const hash of ['', '#port=0', '#port=65536', '#port=-1', '#port=018923', '#port=18923&port=80', '#port=443&server=evil.example', '#port=https://evil.example']) {
    assert.throws(() => localEndpoint(hash), /Invalid local port/);
  }
});

test('only the development page permits local connections', () => {
  const page = readFileSync(new URL('../public/local/index.html', import.meta.url), 'utf8');
  const publicPage = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(page, /connect-src 'self' http:\/\/127\.0\.0\.1:\* ws:\/\/127\.0\.0\.1:\*/);
  assert.doesNotMatch(publicPage, /http:\/\/127\.0\.0\.1:\*|ws:\/\/127\.0\.0\.1:\*/);
  assert.match(page, /role="alert"/);
  assert.match(page, /\.local\/server\.log/);
  assert.match(page, /noindex/);
});

test('website runtime uses the local key-patched SWF, accounts, sounds and socket', async () => {
  const requests = [];
  const env = environment(async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json({ protocol: 1, mode: 'local-development' });
  });
  try {
    await startLocalClient();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://127.0.0.1:18923/local-client');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.equal(env.options().url, 'http://127.0.0.1:18923/client.swf');
    assert.equal(env.options().socketProxy[0].proxyUrl, 'ws://127.0.0.1:18923/game');
    assert.equal(env.options().urlRewriteRules[0][1], 'http://127.0.0.1:18923/legacy-api/');
    assert.equal(env.options().urlRewriteRules[1][1], 'http://127.0.0.1:18923/sfx/');
    assert.equal(env.nodes.game.dataset.loaded, 'true');
    assert.equal(env.nodes.error.hidden, true);
    const socket = new window.WebSocket('ws://127.0.0.1:18923/game');
    socket.dispatchEvent(new Event('open'));
    assert.match(env.nodes.status.textContent, /Connected to your local server/);
    socket.close();
    assert.match(env.nodes.log.textContent, /code=1000, clean=true/);
  } finally { env.restore(); }
});

test('HTTP, network, protocol and runtime failures are visible, never a production retry', async t => {
  for (const [name, fetch, load, expected] of [
    ['HTTP rejection', async () => new Response('unapproved request origin', { status: 403, statusText: 'Forbidden' }), undefined, /HTTP 403 Forbidden.*\nunapproved request origin/],
    ['network refusal', async () => { throw new TypeError('Failed to fetch'); }, undefined, /Failed to fetch/],
    ['timeout', async () => { throw new DOMException('Request timed out', 'TimeoutError'); }, undefined, /Request timed out/],
    ['old backend', async () => Response.json({ protocol: 0 }), undefined, /Incompatible local server/],
    ['runtime', async () => Response.json({ protocol: 1, mode: 'local-development' }), async () => { throw new Error('WASM failed'); }, /WASM failed/]
  ]) {
    await t.test(name, async () => {
      let calls = 0;
      const env = environment(async (...args) => { calls++; return fetch(...args); }, load);
      try {
        await startLocalClient();
        assert.equal(calls, 1);
        assert.equal(env.nodes.error.hidden, false);
        assert.match(env.nodes['error-message'].textContent, expected);
        assert.match(env.nodes.status.textContent, /Local connection failed/);
        assert.notEqual(env.nodes.game.dataset.loaded, 'true');
      } finally { env.restore(); }
    });
  }
});

test('later account API rejection and WebSocket loss remain obvious after loading', async () => {
  const env = environment(async url => String(url).endsWith('/local-client')
    ? Response.json({ protocol: 1, mode: 'local-development' })
    : new Response('<Error>Too many guest entry requests</Error>', { status: 429 }));
  try {
    await startLocalClient();
    await assert.rejects(window.fetch('http://127.0.0.1:18923/legacy-api/char/list?guid=DO_NOT_LOG', { method: 'POST', body: 'password=DO_NOT_LOG' }), /HTTP 429/);
    assert.match(env.nodes.log.textContent, /Too many guest entry requests/);
    assert.doesNotMatch(env.nodes.log.textContent, /DO_NOT_LOG/);
    const socket = new window.WebSocket('ws://127.0.0.1:18923/game');
    socket.dispatchEvent(new Event('error'));
    socket.dispatchEvent(Object.assign(new Event('close'), { code: 1006, wasClean: false, reason: '' }));
    assert.equal(env.nodes.error.hidden, false);
    assert.match(env.nodes.log.textContent, /handshake error/);
    assert.match(env.nodes['error-message'].textContent, /1006/);
  } finally { env.restore(); }
});
