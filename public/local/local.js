export function localEndpoint(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const port = params.get('port');
  if ([...params.keys()].some(key => key !== 'port') || params.getAll('port').length !== 1 ||
      !/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535) {
    throw new Error('Invalid local port. Open the exact https://openrotmg.org/local/#port=... URL printed by ./run.sh.');
  }
  return new URL(`http://127.0.0.1:${port}/`);
}

export async function startLocalClient() {
  const node = id => document.getElementById(id);
  const log = message => {
    node('log').textContent += `${new Date().toISOString()} ${message}\n`;
    console.info('[Open RotMG local]', message);
  };
  let lastError;
  const fail = error => {
    if (lastError === error) return;
    lastError = error;
    node('error').hidden = false;
    node('error-message').textContent = error.message;
    node('status').textContent = 'Local connection failed. See the error and log below.';
    log(`${error.name}: ${error.message}`);
    console.error('[Open RotMG local]', error);
  };
  try {
    const endpoint = localEndpoint(location.hash);
    const socket = new URL('game', endpoint);
    socket.protocol = 'ws:';
    node('status').textContent = `Checking local server at ${endpoint.origin}`;
    log(`Local endpoint: ${endpoint.origin}. Page: ${location.origin}. No production account or game requests.`);

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href);
      if (url.origin !== endpoint.origin) return originalFetch(input, options);
      const label = `${options?.method ?? input.method ?? 'GET'} ${url.origin}${url.pathname}`;
      try {
        log(label);
        const signal = options?.signal ?? input.signal;
        const deadline = AbortSignal.timeout(30000);
        const response = await originalFetch(input, { ...options, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
        if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${response.statusText}\n${(await response.clone().text()).slice(0, 2000)}`);
        return response;
      } catch (error) {
        const failure = new Error(`${label} failed: ${error.name}: ${error.message}`);
        fail(failure);
        throw failure;
      }
    };

    const response = await window.fetch(new URL('local-client', endpoint), { cache: 'no-store', credentials: 'omit' });
    const info = await response.json();
    if (info.protocol !== 1 || info.mode !== 'local-development') {
      throw new Error(`Incompatible local server: expected local-development protocol 1, received ${JSON.stringify(info)}. Update the server and rerun ./run.sh.`);
    }
    log('Local server identified. Loading its public-key-patched client with the website Ruffle runtime.');

    const OriginalSocket = window.WebSocket;
    window.WebSocket = class extends OriginalSocket {
      constructor(url, protocols) {
        super(url, protocols);
        if (new URL(url).href !== socket.href) return;
        log(`Connecting ${socket.href}`);
        const timeout = setTimeout(() => {
          fail(new Error(`WebSocket ${socket.href} did not open within 10 seconds. Check local-network permission and the server log.`));
          this.close();
        }, 10000);
        this.addEventListener('open', () => {
          clearTimeout(timeout);
          log(`WebSocket open: ${socket.href}`);
          node('status').textContent = `Connected to your local server at ${endpoint.origin}`;
        });
        this.addEventListener('error', () => {
          clearTimeout(timeout);
          fail(new Error(`WebSocket ${socket.href} failed. The browser does not expose the handshake error to JavaScript; inspect Developer Tools → Network and .local/server.log.`));
        });
        this.addEventListener('close', event => {
          clearTimeout(timeout);
          log(`WebSocket closed: code=${event.code}, clean=${event.wasClean}, reason=${event.reason || '(none supplied)'}`);
          if (!event.wasClean) fail(new Error(`Local game connection lost (WebSocket close code ${event.code}). See the connection log and .local/server.log.`));
          else if (node('error').hidden) node('status').textContent = `Local game connection closed. Local client: ${endpoint.origin}`;
        });
      }
    };

    if (!window.RufflePlayer) throw new Error('Website Ruffle runtime failed to load. Check Developer Tools → Network for /vendor/ruffle.js.');
    const player = window.RufflePlayer.newest().createPlayer();
    node('game').append(player);
    await player.ruffle().load({
      url: new URL('client.swf', endpoint).href,
      autoplay: 'on', splashScreen: false, unmuteOverlay: 'hidden',
      preferredRenderer: 'wgpu-webgl', openUrlMode: 'deny', allowScriptAccess: false,
      logLevel: 'warn',
      socketProxy: [{ host: '127.0.0.1', port: 2050, proxyUrl: socket.href }],
      urlRewriteRules: [
        [/^https?:\/\/127\.0\.0\.1:8080\//, new URL('legacy-api/', endpoint).href],
        [/^https?:\/\/realmofthemadgod\.appspot\.com\/sfx\//, new URL('sfx/', endpoint).href]
      ]
    });
    node('game').dataset.loaded = 'true';
    log('Local client loaded. Press Play to enter your local game.');
    if (node('error').hidden) node('status').textContent = `Local client ready at ${endpoint.origin}. Press Play.`;
  } catch (error) {
    fail(error);
  }
}

if (typeof document !== 'undefined') startLocalClient();
