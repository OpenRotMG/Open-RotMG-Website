import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {confirmEmail} from '../public/verify-email/app.js';

test('confirmation sends only a token in a no-store POST to the configured backend', async () => {
  const token = 'a'.repeat(64);
  await confirmEmail(token, async (url, request) => {
    assert.equal(url, '/api/account/verify-email');
    assert.deepEqual(JSON.parse(request.body), {token});
    for (const [key,value] of Object.entries({method:'POST',credentials:'omit',mode:'cors',cache:'no-store',redirect:'error'})) assert.equal(request[key],value);
    return Response.json({verified:true});
  });
  await assert.rejects(confirmEmail('bad', () => assert.fail('must not send')), /Invalid verification link/);
  await assert.rejects(confirmEmail(token, async () => Response.json({error:'invalid or expired verification link'}, {status:400})), /expired/);
  await assert.rejects(confirmEmail(token, async () => Response.json({})), /Invalid verification confirmation/);
});

test('link previews do not consume tokens; fragments are cleared and secrets are not persisted', async () => {
  const app = await readFile(new URL('../public/verify-email/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/verify-email/index.html', import.meta.url), 'utf8');
  assert.match(app, /history.replaceState/);
  assert.match(app, /button.addEventListener\('click', async \(\) =>/);
  assert.equal(app.match(/await confirmEmail\(token\)/g).length, 1);
  assert.match(app, /addEventListener\('hashchange', \(\) => location.reload\(\)\)/);
  assert.doesNotMatch(app, /localStorage|sessionStorage|console\./);
  assert.match(html, /no-referrer/);
  assert.match(html, /noindex,nofollow/);
  assert.doesNotMatch(html, /<script[^>]*src="https?:/);
});
