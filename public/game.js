(async () => {
  if (!window.RufflePlayer) throw new Error('Pinned Ruffle runtime did not load.');
  const player = window.RufflePlayer.newest().createPlayer();
  document.querySelector('#game').append(player);
  const socketEndpoint = new URL('/game', document.baseURI);
  socketEndpoint.protocol = socketEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  window.OpenRotMGDiagnostics.start(socketEndpoint);
  await player.ruffle().load({
    url: new URL('/client.swf', document.baseURI).href,
    autoplay: 'on',
    splashScreen: false,
    unmuteOverlay: 'hidden',
    preferredRenderer: 'wgpu-webgl',
    openUrlMode: 'deny',
    allowScriptAccess: false,
    logLevel: 'warn',
    socketProxy: [{ host: '127.0.0.1', port: 2050, proxyUrl: socketEndpoint.href }],
    urlRewriteRules: [
      [/^https?:\/\/127\.0\.0\.1:8080\/(?=(?:char|account|fame)\/)/, new URL('/legacy-api/', document.baseURI).href],
      [/^https?:\/\/realmofthemadgod\.appspot\.com\/sfx\//, new URL('/sfx/', document.baseURI).href]
    ]
  });
  document.querySelector('#game').dataset.loaded = 'true';
  document.querySelector('#startup').hidden = true;
})().catch(error => {
  document.querySelector('#startup').hidden = true;
  const notice = document.querySelector('#load-error');
  notice.textContent = 'Client failed to load: ' + error.message;
  notice.hidden = false;
  console.error('Open RotMG client startup failed', error);
});
