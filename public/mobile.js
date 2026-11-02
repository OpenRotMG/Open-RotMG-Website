// Thumb controls drive the unmodified Flash client by synthesising the keyboard and mouse input Ruffle already handles.
window.OpenRotMGMobile = {
  start(player) {
    const root = document.documentElement;
    const link = document.querySelector('a[href="/#mobile-controls"]');
    const viewport = document.querySelector('meta[name="viewport"]');
    const desktopViewport = viewport.content;
    const names = {KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', Insert: 'Insert', Space: ' '};
    const held = new Set();
    // The 123.5.1 client draws its 600x600 map left of the sidebar with the player 25px below the map centre.
    const centre = {x: 300, y: 325};
    const key = (code, down) => {
      if (held.has(code) === down) return;
      down ? held.add(code) : held.delete(code);
      // Ruffle ignores keys unless its element has focus, and tapping these controls must not take it away.
      player.focus({preventScroll: true});
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code, key: names[code], bubbles: true}));
    };
    const mouse = (type, u, v) => {
      const canvas = player.shadowRoot.querySelector('canvas');
      if (!canvas) throw new Error('Game canvas is not available for mobile aiming.');
      const box = canvas.getBoundingClientRect();
      const x = Math.min(599, Math.max(0, centre.x + (u - .5) * 600));
      const y = Math.min(599, Math.max(0, centre.y + (v - .5) * 600));
      // A pointer ID that is never active keeps Ruffle's setPointerCapture from stealing the thumb's real touch.
      canvas.dispatchEvent(new PointerEvent(type, {view: window, pointerId: 9999, pointerType: 'mouse', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, composed: true,
        clientX: box.left + x / 800 * box.width, clientY: box.top + y / 600 * box.height}));
    };
    // Each control follows only the finger that pressed it, so both thumbs work at once.
    const track = (element, move, end) => element.addEventListener('pointerdown', down => {
      down.preventDefault();
      if (element.dataset.pointer) return;
      element.dataset.pointer = down.pointerId;
      element.setPointerCapture(down.pointerId);
      const box = element.getBoundingClientRect();
      const at = event => {
        const u = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        const v = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        element.style.setProperty('--u', u);
        element.style.setProperty('--v', v);
        move(u, v, event.type);
      };
      const moved = event => { if (event.pointerId === down.pointerId) at(event); };
      const released = event => {
        if (event.pointerId !== down.pointerId) return;
        element.removeEventListener('pointermove', moved);
        element.removeEventListener('lostpointercapture', released);
        delete element.dataset.pointer;
        element.style.removeProperty('--u');
        element.style.removeProperty('--v');
        end();
      };
      element.addEventListener('pointermove', moved);
      element.addEventListener('lostpointercapture', released);
      at(down);
    });
    track(document.querySelector('#move-stick'), (u, v) => {
      const x = u - .5, y = v - .5, length = Math.hypot(x, y);
      // sin(22.5°) splits the stick into eight directions; the centre is a dead zone.
      const near = length > .12 ? .383 * length : Infinity;
      key('KeyW', y < -near); key('KeyS', y > near); key('KeyA', x < -near); key('KeyD', x > near);
    }, () => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(code => key(code, false)));
    let aim;
    track(document.querySelector('#aim-pad'), (u, v, type) => {
      aim = [u, v];
      if (type === 'pointerdown') {
        player.focus({preventScroll: true});
        // A finger leaving the canvas marks the mouse outside the stage, which would hide the map from the click.
        mouse('pointerenter', u, v);
      }
      mouse('pointermove', u, v);
      if (type === 'pointerdown') mouse('pointerdown', u, v);
    }, () => mouse('pointerup', ...aim));
    for (const button of document.querySelectorAll('#mobile-controls [data-code]')) track(button, () => key(button.dataset.code, true), () => key(button.dataset.code, false));
    const block = event => event.preventDefault();
    const enter = () => {
      root.classList.add('mobile');
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
      // Safari ignores user-scalable, so pinches are cancelled directly.
      document.addEventListener('gesturestart', block);
      document.addEventListener('touchmove', block, {passive: false});
    };
    document.querySelector('#mobile-exit').addEventListener('click', () => {
      root.classList.remove('mobile');
      viewport.content = desktopViewport;
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('touchmove', block);
      if (document.fullscreenElement) void document.exitFullscreen().catch(error => console.error('Leaving fullscreen failed', error));
    });
    link.addEventListener('click', event => {
      event.preventDefault();
      enter();
      // iPhone Safari has no element fullscreen; the fixed layout alone keeps the page still there.
      if (document.fullscreenEnabled) void root.requestFullscreen({navigationUI: 'hide'}).catch(error => console.error('Fullscreen request failed', error));
    });
    if (location.hash === '#mobile-controls') enter();
  }
};
