(async () => {
  const base = new URL('./', location.href);
  const socket = new URL('game', base);
  socket.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const player = window.RufflePlayer.newest().createPlayer();
  document.querySelector('#game').append(player);
  await player.ruffle().load({
    url: new URL('client-data-repaired.swf', base).href,
    autoplay: 'on', unmuteOverlay: 'hidden', openUrlMode: 'deny', allowScriptAccess: false,
    preferredRenderer: 'wgpu-webgl', logLevel: 'info',
    urlRewriteRules: [
      [/^http:\/\/www\.realmofthemadgod\.com\//, new URL('legacy/', base).href],
      [/^http:\/\/(?:rotmgtesting|realmofthemadgod)\.appspot\.com\//, new URL('legacy/', base).href]
    ],
    socketProxy: [{ host: '127.0.0.1', port: 2050, proxyUrl: socket.href }]
  });
})().catch(error => {
  document.querySelector('#status').textContent = `2010 preview failed to load: ${error.message}`;
  console.error(error);
});
