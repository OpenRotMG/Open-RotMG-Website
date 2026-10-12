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
    if (node('error').hidden) node('error-message').textContent = error.message;
    node('error').hidden = false;
    if (node('game').dataset.loaded !== 'true') node('game').hidden = true;
    node('status').textContent = 'Local connection failed. See the error and log below.';
    log(`${error.name}: ${error.message}`);
    console.error('[Open RotMG local]', error);
  };
  document.addEventListener('securitypolicyviolation', event => {
    const message = `Browser Content Security Policy blocked ${event.blockedURI.split(/[?#]/)[0]} (${event.violatedDirective}).`;
    if (event.blockedURI.startsWith('http://127.0.0.1:') || event.violatedDirective.startsWith('style-src')) fail(new Error(message));
    else log(message);
  });
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
        const response = await originalFetch(input, options);
        if (!response.ok) throw new Error(`${label}: HTTP ${response.status} ${response.statusText}\n${(await response.clone().text()).slice(0, 2000)}`);
        return response;
      } catch (error) {
        const failure = new Error(`${label} failed: ${error.name}: ${error.message}`);
        fail(failure);
        throw failure;
      }
    };

    const response = await window.fetch(new URL('local-client', endpoint), { signal: AbortSignal.timeout(30000), cache: 'no-store', credentials: 'omit' });
    const info = await response.json();
    if (info.protocol !== 1 || info.mode !== 'local-development') {
      throw new Error(`Incompatible local server: expected local-development protocol 1, received ${JSON.stringify(info)}. Update the server and rerun ./run.sh.`);
    }
    log('Local server identified. Loading its public-key-patched client with the website Ruffle runtime.');

    const OriginalSocket = window.WebSocket;
    // Ruffle's WASM bindings need native socket instances, not subclasses.
    window.WebSocket = new Proxy(OriginalSocket, {
      construct(Target, args) {
        const connection = Reflect.construct(Target, args);
        if (new URL(args[0]).href !== socket.href) return connection;
        log(`Connecting ${socket.href}`);
        const timeout = setTimeout(() => {
          fail(new Error(`WebSocket ${socket.href} did not open within 10 seconds. Check local-network permission and the server log.`));
          connection.close();
        }, 10000);
        connection.addEventListener('open', () => {
          clearTimeout(timeout);
          log(`WebSocket open: ${socket.href}`);
          if (node('error').hidden) node('status').textContent = `Connected to your local server at ${endpoint.origin}`;
        });
        connection.addEventListener('error', () => {
          clearTimeout(timeout);
          fail(new Error(`WebSocket ${socket.href} failed. The browser does not expose the handshake error to JavaScript; inspect Developer Tools → Network and .local/server.log.`));
        });
        connection.addEventListener('close', event => {
          clearTimeout(timeout);
          log(`WebSocket closed: code=${event.code}, clean=${event.wasClean}, reason=${event.reason || '(none supplied)'}`);
          if (!event.wasClean) fail(new Error(`Local game connection lost (WebSocket close code ${event.code}). See the connection log and .local/server.log.`));
          else if (node('error').hidden) node('status').textContent = `Local game connection closed. Local client: ${endpoint.origin}`;
        });
        return connection;
      }
    });

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
