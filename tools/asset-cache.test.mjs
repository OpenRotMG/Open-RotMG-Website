import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';

const source = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8');
const origin = 'https://example.test';
const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const entries = new Map(), requests = [];
  const cache = {
    match: async url => entries.get(url)?.clone(),
    put: async (url, response) => {const body = await response.arrayBuffer(); entries.set(url, new Response(body, response));},
    keys: async () => [...entries.keys()].map(url => ({url})),
    delete: async key => entries.delete(key.url)
  };
  async function boot(movie = 'movie one', engine = 'engine one', failure) {
    const hashes = {'/client.swf': hash(movie), '/vendor/engine.wasm': hash(engine)};
    const nodes = {'#game': {dataset: {mode: 'game', runtimeSizes: JSON.stringify({'engine.wasm': engine.length}), assetHashes: JSON.stringify(hashes)}, append() {}}, '#startup': {}, '#startup span': {}, '#startup progress': {}, '#startup button': {addEventListener() {}}, '#load-error': {hidden: true}};
    const context = {URL, Response, ReadableStream, btoa, AbortSignal, crypto: {getRandomValues: bytes => bytes.fill(1)},
      caches: {open: async name => {assert.equal(name, 'openrotmg-game-assets-v1'); return cache;}},
      document: {baseURI: origin + '/', querySelector: key => nodes[key]}, console: {error() {}},
      OpenRotMGBackend: {url: path => new URL(path, origin), fetch: async () => ({ok: true})},
      OpenRotMGDiagnostics: {start() {}}, OpenRotMGMobile: {start() {}}, setInterval() {}, clearInterval() {}, addEventListener() {},
      fetch: async (url, options) => {
        requests.push(url);
        const path = new URL(url).pathname;
        if (failure) return failure(url);
        const bytes = path.endsWith('.wasm') ? engine : movie;
        assert.equal(options.integrity, 'sha256-' + Buffer.from(hash(bytes), 'hex').toString('base64'));
        return Object.defineProperty(new Response(bytes, {headers: {'content-length': String(bytes.length)}}), 'url', {value: url});
      }
    };
    context.window = context;
    context.RufflePlayer = {newest: () => ({createPlayer: () => ({addEventListener() {}, ruffle: () => ({load: async config => {
      assert.equal(await (await context.fetch(origin + '/vendor/engine.wasm')).text(), engine);
      assert.equal(await (await context.fetch(config.url)).text(), movie);
    }})})})};
    await runInNewContext(source, context);
    return nodes;
  }
  return {boot, entries, requests, cache};
}

test('repeat visits reuse engine and client; only changed bytes download and obsolete versions leave the cache', async () => {
  const f = fixture();
  let nodes = await f.boot();
  assert.equal(nodes['#load-error'].hidden, true);
  assert.equal(f.requests.length, 2);
  nodes = await f.boot();
  assert.equal(f.requests.length, 2);
  assert.equal(nodes['#startup span'].textContent, 'Loading cached game client');
  await f.boot('movie two');
  assert.equal(f.requests.length, 3);
  assert.equal(f.entries.size, 2);
  await f.boot('movie two', 'engine two');
  assert.equal(f.requests.length, 4);
  assert.equal(f.entries.size, 2);
  for (const key of f.entries.keys()) assert.equal(new URL(key).searchParams.get('v'), key.includes('.wasm') ? hash('engine two') : hash('movie two'));
});

test('HTTP errors and interrupted streams cannot poison persistent assets', async () => {
  for (const failure of [() => new Response('unavailable', {status: 503}), () => new Response(new ReadableStream({start(c) {c.error(new Error('disconnected'));}}))]) {
    const f = fixture();
    const nodes = await f.boot('movie one', 'engine one', failure);
    assert.equal(nodes['#load-error'].hidden, false);
    assert.equal(f.entries.size, 0);
    await f.boot();
    assert.equal(f.entries.size, 2);
  }
});

test('storage failures are visible rather than pretending the download was saved', async () => {
  const f = fixture();
  f.cache.put = async () => {throw new Error('quota exceeded');};
  const nodes = await f.boot();
  assert.match(nodes['#load-error'].textContent, /Asset cache write failed: quota exceeded/);
  assert.equal(f.entries.size, 0);
});
