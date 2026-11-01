let failed = false;
// Ruffle's own failure screen blames the site; a dropped connection only needs a retry.
function showFailure(detail, error) {
  if (failed) return;
  failed = true;
  console.error(detail, error);
  document.querySelector('#game').dataset.failed = 'true';
  document.querySelector('#startup').hidden = false;
  document.querySelector('#startup span').textContent = 'The game could not finish loading. Check your connection and try again.';
  document.querySelector('#startup progress').hidden = true;
  const retry = document.querySelector('#startup button');
  retry.hidden = false;
  retry.addEventListener('click', () => location.reload());
  const notice = document.querySelector('#load-error');
  notice.textContent = detail;
  notice.hidden = false;
}

// Ruffle reports no download progress, so count its runtime and movie bytes as its own fetches stream them.
function showDownloads(movie, movieName, runtimeSizes) {
  const bar = document.querySelector('#startup progress');
  const label = document.querySelector('#startup span');
  const vendor = new URL('/vendor/', document.baseURI);
  const send = window.fetch;
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, document.baseURI);
    const runtime = url.origin === vendor.origin && url.pathname.startsWith(vendor.pathname) && url.pathname.endsWith('.wasm');
    if (!runtime && url.href !== movie.href) return send(input, init);
    const interrupted = error => {
      showFailure(`Download of ${url.pathname} failed: ${error.message}`, error);
      throw error;
    };
    const response = await send(input, init).catch(interrupted);
    if (!response.ok) interrupted(new Error(`HTTP ${response.status}`));
    // Pages gzips the runtime, so its streamed size comes from the build rather than Content-Length.
    const total = runtime ? runtimeSizes[url.pathname.slice(vendor.pathname.length)] : !response.headers.get('content-encoding') && Number(response.headers.get('content-length'));
    if (!total) throw new Error(`Unknown download size for ${url.pathname}`);
    const name = runtime ? 'game engine' : movieName;
    const reader = response.body.getReader();
    let loaded = 0;
    const counted = new Response(new ReadableStream({async pull(output) {
      const {done, value} = await reader.read().catch(interrupted);
      if (done) return output.close();
      loaded += value.length;
      bar.value = loaded / total;
      label.textContent = `Downloading ${name}: ${(loaded / 1e6).toFixed(1)} of ${(total / 1e6).toFixed(1)} MB`;
      output.enqueue(value);
    }}), response);
    Object.defineProperty(counted, 'url', {value: response.url});
    return counted;
  };
}

(async () => {
  if (!window.RufflePlayer) throw new Error('Pinned Ruffle runtime did not load.');
  const player = window.RufflePlayer.newest().createPlayer();
  document.querySelector('#game').append(player);
  const socketEndpoint = OpenRotMGBackend.url('/game');
  socketEndpoint.protocol = socketEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  player.addEventListener('loadeddata', () => {
    document.querySelector('#game').dataset.loaded = 'true';
    document.querySelector('#startup').hidden = true;
  }, {once: true});
  window.OpenRotMGDiagnostics.start(socketEndpoint, player);
  const movies = {game: '/client.swf', editor: '/draw/native-texture-editor.swf'};
  const mode = document.querySelector('#game').dataset.mode;
  if (!Object.hasOwn(movies, mode)) throw new Error(`Unknown client mode: ${mode}`);
  if (mode === 'game') void OpenRotMGBackend.fetch('/health', {cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000)}).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  }).catch(error => {
    const notice = document.querySelector('#load-error');
    notice.textContent = 'Game server unavailable. The website and client can still load. Try reconnecting shortly.';
    notice.hidden = false;
    console.error('Game server health check failed', error);
  });
  async function browserRequest(payload) {
    const response = await OpenRotMGBackend.fetch('/api/account/browser', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(payload), credentials: 'include', mode: 'cors', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000)});
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Invalid browser authentication error');
    if (result.state === 'waiting') return;
    if (result.tab !== payload.tab) throw new Error('Invalid browser authentication response');
    return result.tab;
  }
  const browser = mode === 'game' ? Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('') : null;
  const browserRules = browser ? [[/^https?:\/\/127\.0\.0\.1:8080\/char\/list$/, OpenRotMGBackend.url('/legacy-api/char/list').href + `?browser=${browser}`]] : [];
  const movie = new URL(movies[mode], document.baseURI);
  showDownloads(movie, mode === 'game' ? 'game client' : 'pixel editor', JSON.parse(document.querySelector('#game').dataset.runtimeSizes));
  await player.ruffle().load({
    url: movie.href,
    autoplay: 'on',
    splashScreen: false,
    unmuteOverlay: 'hidden',
    preferredRenderer: 'wgpu-webgl',
    openUrlMode: 'confirm',
    allowScriptAccess: false,
    logLevel: 'warn',
    credentialAllowList: [socketEndpoint.origin.replace(/^ws/, 'http')],
    socketProxy: [{ host: '127.0.0.1', port: 2050, proxyUrl: socketEndpoint.href }],
    urlRewriteRules: [
      ...browserRules,
      [/^https?:\/\/127\.0\.0\.1:8080\/(?=(?:char|account|fame|guild|picture)\/)/, OpenRotMGBackend.url('/legacy-api/').href],
      [/^https?:\/\/realmofthemadgod\.appspot\.com\/sfx\//, new URL('/sfx/', document.baseURI).href]
    ]
  });
  if (browser) {
    const timer = setInterval(() => void browserRequest({tab: browser}).catch(error => {
      clearInterval(timer);
      const notice = document.querySelector('#load-error');
      notice.textContent = 'Game connection failed: ' + error.message + '. The website and client are still available.';
      notice.hidden = false;
      console.error('Game browser authentication lost', error);
    }), 20000);
    addEventListener('pagehide', () => {
      clearInterval(timer);
      void OpenRotMGBackend.fetch('/api/account/browser/close', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({tab: browser}), credentials: 'include', mode: 'cors', keepalive: true}).catch(error => console.error('Browser sign-out could not be confirmed', error));
    }, {once: true});
  }
})().catch(error => {
  showFailure('Client failed to load: ' + error.message, error);
});
