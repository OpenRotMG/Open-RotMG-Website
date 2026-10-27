export async function confirmEmail(token, fetchImpl = globalThis.OpenRotMGBackend.fetch) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid verification link');
  const response = await fetchImpl('/api/account/verify-email', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({token}), credentials: 'omit', mode: 'cors', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)});
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Verification rejected (${response.status})`);
  if (result.verified !== true) throw new Error('Invalid verification confirmation');
}
function start() {
  let token = location.hash.slice(1);
  const valid = /^[a-f0-9]{64}$/.test(token) && !location.search;
  history.replaceState(null, '', location.pathname);
  const status = document.querySelector('#status'), button = document.querySelector('#confirm');
  if (!valid) {status.textContent = 'Open the verification link from your email. Request a new one from the game’s Current account dialog.';return;}
  status.textContent = 'This link expires after 24 hours and can only be used once.';
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Confirming your email…';
    try {
      await confirmEmail(token);
      token = '';button.hidden = true;
      status.textContent = 'Email verified. Reopen Current account in the game to see the updated status.';
    } catch (error) {
      status.textContent = `Completion could not be confirmed: ${error.message}. If the connection was interrupted, check Current account in the game before requesting another email.`;
    } finally {button.disabled = false;}
  });
}
if (typeof document !== 'undefined') {start();addEventListener('hashchange', () => location.reload());}
