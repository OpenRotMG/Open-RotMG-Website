(async () => {
  if (!window.RufflePlayer) throw new Error('Pinned Ruffle runtime did not load.');
  const player = window.RufflePlayer.newest().createPlayer();
  document.querySelector('#game').append(player);
  await player.ruffle().load({
    url: new URL('client/123.5.1.swf', document.baseURI).href,
    autoplay: 'on',
    unmuteOverlay: 'hidden',
    preferredRenderer: 'wgpu-webgl',
    openUrlMode: 'deny',
    allowScriptAccess: false,
    logLevel: 'warn',
    urlRewriteRules: [
      [/^https?:\/\/127\.0\.0\.1:8080\//, new URL('legacy-api/', document.baseURI).href]
    ]
  });
  document.querySelector('#game').dataset.loaded = 'true';
})().catch(error => {
  const notice = document.querySelector('#load-error');
  notice.textContent = 'Client failed to load: ' + error.message;
  notice.hidden = false;
  console.error('OpenRotMG client startup failed', error);
});
