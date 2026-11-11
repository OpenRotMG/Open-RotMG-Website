import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {gzipSync, brotliCompressSync} from 'node:zlib';
import {runInNewContext} from 'node:vm';
import {exportAccount} from '../public/export/app.js';

const save = {format: 1, content: '123.5.1', exported_at: 1793700000, name: 'Synthetic only'};
const headers = {'content-type': 'application/json', 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="openrotmg-account-1793700000.json"'};
const response = (body = JSON.stringify(save), options = {}) => new Response(body, {headers, ...options});
const filename='openrotmg-account-Synthetic-only-2026-11-03.json';
const submit = reply => exportAccount('owner@example.test', 'synthetic-password', async () => reply);

test('export uses only explicit owner credentials in a bounded no-store POST body, and preserves actual bytes', async () => {
  const bytes = JSON.stringify(save, null, 2);
  const result = await exportAccount('owner@example.test', 'synthetic-password', async (url, request) => {
    assert.equal(url, '/api/account/export');
    assert.deepEqual(JSON.parse(request.body), {email: 'owner@example.test', password: 'synthetic-password'});
    assert.deepEqual(request.headers, {'content-type': 'application/json'});
    for (const [key, value] of Object.entries({method: 'POST', credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error'})) assert.equal(request[key], value);
    assert.ok(request.signal instanceof AbortSignal);
    return response(bytes);
  });
  assert.equal(result.filename, filename);
  assert.equal(result.blob.type, 'application/json');
  assert.equal(await result.blob.text(), bytes);
  for (const [email, password] of [['', 'password'], ['owner@example.test', ''], [3, 'password']]) {
    await assert.rejects(exportAccount(email, password, () => {throw Error('must not fetch');}), /Enter your registered/);
  }
});

test('download names use the account name and UTC export date, never a login, path or local clock',async()=>{
 for(const [name,expected] of [['Dan','Dan'],['日本語','日本語'],['../Dan\\\\name','Dan-name'],['  My Player  ','My-Player']]){
  const bytes=JSON.stringify({...save,name,exported_at:Date.UTC(2026,10,12,0,1)/1000}),result=await submit(response(bytes));assert.equal(result.filename,`openrotmg-account-${expected}-2026-11-12.json`);assert.equal(await result.blob.text(),bytes);
 }
 for(const name of [undefined,null,3,'','...','owner@example.test','x'.repeat(81)])await assert.rejects(submit(response(JSON.stringify({...save,name}))),/invalid export response/);
 for(const exported_at of [Number.MAX_SAFE_INTEGER,253402300800])await assert.rejects(submit(response(JSON.stringify({...save,exported_at}))),/invalid export response/);
});

test('export errors are validated JSON and static status-specific instructions, never server or network secrets', async () => {
  const secret = 'owner@example.test synthetic-password guid recovery-token';
  for (const [status, expected] of [[401, /incorrect/], [409, /Leave the game/], [403, /openrotmg.org\/export/], [429, /Too many/], [500, /Try again later/], [503, /Try again later/]]) {
    await assert.rejects(submit(response(JSON.stringify({error: secret}), {status})), error => expected.test(error.message) && !error.message.includes(secret));
  }
  for (const body of ['<html>error</html>', '{}', '{"error":3}', '{"error":"x","password":"leak"}', 'null']) {
    await assert.rejects(submit(response(body, {status: 401})), /invalid export response/);
  }
  await assert.rejects(exportAccount('owner@example.test', 'synthetic-password', async () => {throw Error(secret);}), error => /connection/.test(error.message) && !error.message.includes(secret));
  for (const name of ['AbortError', 'TimeoutError']) {
    await assert.rejects(exportAccount('owner@example.test', 'synthetic-password', async () => {throw new DOMException(secret, name);}), /timed out/);
  }
});

test('no successful mock fallback: export refuses corrupt JSON, wrong envelope, MIME, caching, status and filenames', async () => {
  for (const body of ['broken', 'null', '[]', '{}', '{"error":"pretend success"}', JSON.stringify({...save, format: 2}), JSON.stringify({...save, exported_at: 0}), JSON.stringify({...save, content: 'unknown'})]) {
    await assert.rejects(submit(response(body)), /invalid export response/);
  }
  for (const disposition of ['', 'inline', 'attachment; filename="../account.json"', 'attachment; filename="owner@example.test.json"', 'attachment; filename="openrotmg-account-0.json"', 'attachment; filename="openrotmg-account-1793700000.json', 'attachment; filename=openrotmg-account-1793700000.json"', 'attachment; filename="openrotmg-account-9007199254740992.json"']) {
    await assert.rejects(submit(response(undefined, {headers: {...headers, 'content-disposition': disposition}})), /invalid export response/);
  }
  for (const changed of [{'content-type': 'text/html'}, {'content-type': 'application/octet-stream'}, {'cache-control': 'public'}, {'cache-control': ''}, {'content-length': 'invalid'}]) {
    await assert.rejects(submit(response(undefined, {headers: {...headers, ...changed}})), /invalid export response/);
  }
  await assert.rejects(submit(response(undefined, {status: 201})), /invalid export response/);
  assert.equal((await submit(response(undefined, {headers: {...headers, 'content-disposition': 'attachment; filename=openrotmg-account-1793700000.json'}}))).filename, filename);
});

test('export handles real HTTP compressed success, conflict, decoded limits and interrupted transport', async t => {
  let status, encoding, body, truncated = false;
  const server = createServer(async (request, reply) => {
    let received = '';
    for await (const chunk of request) received += chunk;
    assert.equal(request.url, '/api/account/export');
    assert.deepEqual(JSON.parse(received), {email: 'owner@example.test', password: 'synthetic-password'});
    const encoded = encoding === 'gzip' ? gzipSync(body) : brotliCompressSync(body);
    assert.notEqual(encoded.length, Buffer.byteLength(body));
    reply.writeHead(status, {...headers, 'content-encoding': encoding, 'content-length': encoded.length, connection: 'close'});
    reply.end(truncated ? encoded.subarray(0, encoded.length - 8) : encoded);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = () => exportAccount('owner@example.test', 'synthetic-password', (path, options) => fetch(new URL(path, origin), options));
  try {
    for (encoding of ['gzip', 'br']) {
      await t.test(`${encoding} success preserves decoded attachment bytes`, async () => {
        status = 200; body = JSON.stringify(save);
        const result = await request();
        assert.equal(await result.blob.text(), body);
        assert.equal(result.filename, filename);
      });
      await t.test(`${encoding} conflict keeps static leave-game instructions`, async () => {
        status = 409; body = JSON.stringify({error: 'owner@example.test synthetic-password '.repeat(10)});
        await assert.rejects(request(), {message: 'Leave the game on every device, wait for your character to finish saving, then try again.'});
      });
    }
    encoding = 'gzip';
    for (const [code, limit] of [[200, 32 * 1024 * 1024], [409, 4096]]) {
      await t.test(`compressed ${code} rejects oversized decoded bytes`, async () => {
        status = code;
        const json = JSON.stringify(code === 200 ? save : {error: 'synthetic only'});
        body = json + ' '.repeat(limit + 1 - Buffer.byteLength(json));
        assert.ok(gzipSync(body).length < limit);
        await assert.rejects(request(), /invalid export response/);
      });
    }
    await t.test('truncated real gzip transport remains a connection error', async () => {
      status = 200; body = JSON.stringify(save); truncated = true;
      await assert.rejects(request(), /Check your connection/);
    });
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test('export bounds declared and streamed bytes, cancels oversized bodies and reports interrupted streams', async () => {
  for (const [status, limit] of [[200, 32 * 1024 * 1024], [401, 4096]]) {
    let cancelled = false;
    const stream = new ReadableStream({pull(controller) {controller.enqueue(new Uint8Array(limit + 1));}, cancel() {cancelled = true;}});
    await assert.rejects(submit(response(stream, {status})), /invalid export response/);
    assert.equal(cancelled, true);
    await assert.rejects(submit(response('', {status, headers: {...headers, 'content-length': String(limit + 1)}})), /invalid export response/);
  }
  const broken = new ReadableStream({start(controller) {controller.error(Error('secret interrupted body'));}});
  await assert.rejects(submit(response(broken)), /connection/);
  // Exactly the documented bound remains a valid download, not a smaller hidden limit.
  const bytes = JSON.stringify(save) + ' '.repeat(32 * 1024 * 1024 - JSON.stringify(save).length);
  assert.equal((await submit(response(bytes))).blob.size, 32 * 1024 * 1024);
});

test('export deadline aborts a real stalled body, not only initial response headers', async () => {
  const timeout = AbortSignal.timeout, keepAlive = setTimeout(() => {}, 1000);
  AbortSignal.timeout = milliseconds => {assert.equal(milliseconds, 25000); return timeout(30);};
  try {
    await assert.rejects(exportAccount('owner@example.test', 'synthetic-password', async (url, request) => {
      return response(new ReadableStream({start(controller) {
        request.signal.addEventListener('abort', () => controller.error(request.signal.reason), {once: true});
      }}));
    }), /timed out/);
  } finally {AbortSignal.timeout = timeout; clearTimeout(keepAlive);}
});

test('actual export template and submit handler show pending/success/errors and re-enable the button', async () => {
  const html=await readFile(new URL('../public/export/index.html',import.meta.url),'utf8');
  const source=(await readFile(new URL('../public/export/app.js',import.meta.url),'utf8')).replace('export async function','async function');
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(([,id])=>[id,{value:'',textContent:''}]));
  assert.match(html,/<p id="status" role="status" aria-live="polite"><\/p>/);
  let submit,finish;const button={disabled:true},downloads=[];
  elements.get('export-form').querySelector=selector=>{assert.equal(selector,'button');return button;};
  elements.get('export-form').addEventListener=(event,fn)=>{assert.equal(event,'submit');submit=fn;};
  const document={querySelector:selector=>elements.get(selector.slice(1))??null,body:{append(){}},createElement:()=>({click(){downloads.push(this.download);},remove(){}})};
  const fetch=()=>new Promise(ok=>finish=ok);
  runInNewContext(source,{document,history:{replaceState(){}},location:{pathname:'/export/'},addEventListener(){},Blob,Response,AbortSignal,setTimeout:fn=>fn(),URL:{createObjectURL:()=> 'blob:unit',revokeObjectURL(){}},OpenRotMGBackend:{fetch}});
  for(const ok of [true,false]){
    elements.get('email').value='owner@example.test';elements.get('password').value='synthetic-password';
    const pending=submit({preventDefault(){}});
    assert.equal(elements.get('status').textContent,'Preparing your account save…');assert(button.disabled);
    assert.equal(elements.get('email').value,'');assert.equal(elements.get('password').value,'');
    finish(ok?response():response('{"error":"invalid credentials"}',{status:401}));await pending;
    assert.equal(button.disabled,false);assert.match(elements.get('status').textContent,ok?/account save is ready/:/incorrect/);
  }
  assert.deepEqual(downloads,[filename]);
});

test('export page has no credential URL path or persistence; public metadata stays generic and existing private pages stay noindex', async () => {
  const app = await readFile(new URL('../public/export/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/export/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /localStorage|sessionStorage|console\.|URLSearchParams/);
  assert.match(app, /history.replaceState\(null, '', location.pathname\)/);
  assert.match(app, /addEventListener\('pagehide', clear\)/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /connect-src {{API_ORIGIN}}/);
  assert.match(html, /<button type="submit" disabled>/);
  assert.doesNotMatch(html, /<input[^>]*name=|unsafe-inline|unsafe-eval|<script[^>]+src="https?:/);
  for (const path of ['recover', 'verify-email', 'link']) {
    const privateHtml = await readFile(new URL(`../public/${path}/index.html`, import.meta.url), 'utf8');
    assert.match(privateHtml, /noindex/);
  }
});
