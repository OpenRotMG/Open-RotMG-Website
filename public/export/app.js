const MAX_BYTES = 32 * 1024 * 1024;
class ExportError extends Error {}
const invalid = () => new ExportError('The server returned an invalid export response. No file was downloaded.');
const messages = {
  401: 'Email or password is incorrect. Use a registered game account, not a guest account.',
  409: 'Leave the game on every device, wait for your character to finish saving, then try again.',
  403: 'Open https://openrotmg.org/export/ and try again from that page.',
  429: 'Too many export attempts. Wait a little before trying again.'
};
async function readBounded(response, limit) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) {
    await response.body?.cancel();
    throw invalid();
  }
  if (!response.body) throw invalid();
  const reader = response.body.getReader(), chunks = [];
  let size = 0, complete = false;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) {complete = true; break;}
      size += value.byteLength;
      if (size > limit) throw invalid();
      chunks.push(value);
    }
  } finally {
    if (!complete) await reader.cancel();
    reader.releaseLock();
  }
  return new Blob(chunks, {type: 'application/json'});
}
export async function exportAccount(email, password, fetchImpl = globalThis.OpenRotMGBackend.fetch) {
  try {
    if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
      throw new ExportError('Enter your registered game email and password.');
    }
    const pending = fetchImpl('/api/account/export', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email, password}), credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25000)});
    email = password = '';
    const response = await pending;
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '') ||
        !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('cache-control') ?? '')) {
      await response.body?.cancel();
      throw invalid();
    }
    const blob = await readBounded(response, response.ok ? MAX_BYTES : 4096);
    let result;
    try {result = JSON.parse(await blob.text());} catch {throw invalid();}
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw invalid();
    if (!response.ok) {
      if (typeof result.error !== 'string' || Object.keys(result).length !== 1) throw invalid();
      throw new ExportError(messages[response.status] ?? (response.status >= 500 ? 'The server could not export your save. Try again later.' : 'Export was rejected. Check your account details and try again.'));
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = /^attachment;\s*filename=("openrotmg-account-[1-9]\d*\.json"|openrotmg-account-[1-9]\d*\.json)$/.exec(disposition)?.[1].replaceAll('"', '');
    if (response.status !== 200 || !filename || !Number.isSafeInteger(Number(filename.match(/-(\d+)\.json$/)[1])) ||
        result.format !== 1 || result.content !== '123.5.1' || !Number.isSafeInteger(result.exported_at) || result.exported_at <= 0 || 'error' in result) throw invalid();
    if (typeof result.name !== 'string' || !result.name.trim() || result.name.length > 80 || result.name.includes('@')) throw invalid();
    const account = result.name.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '');
    const exported = new Date(result.exported_at * 1000);
    if (!account || !Number.isFinite(exported.getTime())) throw invalid();
    const date = exported.toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw invalid();
    return {blob, filename: `openrotmg-account-${account}-${date}.json`};
  } catch (error) {
    if (error instanceof ExportError) throw error;
    throw new ExportError(error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'Export timed out. No file was downloaded. Try again.'
      : 'Export could not be completed. Check your connection and try again.');
  }
}
function start() {
  history.replaceState(null, '', location.pathname);
  const form = document.querySelector('#export-form'), email = document.querySelector('#email'), password = document.querySelector('#password'), button = form.querySelector('button'), status = document.querySelector('#status');
  const clear = () => {email.value = ''; password.value = '';};
  clear();
  addEventListener('pagehide', clear);
  addEventListener('pageshow', clear);
  button.disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Preparing your account save…';
    const pending = exportAccount(email.value, password.value);
    clear();
    try {
      const {blob, filename} = await pending;
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = filename;
      document.body.append(link); link.click(); link.remove();
      // Browsers may start the download after the click task has finished.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Your account save is ready. Check Downloads for ${filename}. Keep this file private.`;
    } catch (error) {status.textContent = error instanceof ExportError ? error.message : 'The browser could not start the download. No download was confirmed. Try again.';}
    finally {clear(); button.disabled = false;}
  });
}
if (typeof document !== 'undefined') start();
