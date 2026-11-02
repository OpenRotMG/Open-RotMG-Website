// Thumb controls use the same input path as the keyboard and mouse in the preserved client.
window.OpenRotMGMobile = {
  start(player) {
    const root = document.documentElement;
    const link = document.querySelector('a[href="/#mobile-controls"]');
    const viewport = document.querySelector('meta[name="viewport"]');
    const desktopViewport = viewport.content;
    const cursor = document.querySelector('#aim-cursor');
    const keyboard = player.shadowRoot.querySelector('#virtual-keyboard');
    if (!keyboard) throw new Error('Ruffle mobile keyboard is not available.');
    const names = {KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyQ: 'q', KeyE: 'e', Insert: 'Insert', Space: ' '};
    const held = new Set(), releases = [];
    let cameraMode = false;
    const emit = (type, key, code = '') => player.dispatchEvent(new KeyboardEvent(type, {key, code, bubbles: true}));
    const key = (code, down) => {
      if (held.has(code) === down) return;
      down ? held.add(code) : held.delete(code);
      player.focus({preventScroll: true});
      emit(down ? 'keydown' : 'keyup', names[code], code);
    };
    const press = (name, code = '') => { emit('keydown', name, code); emit('keyup', name, code); };

    // Native keys and Ruffle's input listener both insert text. Only committed input may insert characters.
    let composing = false, deletion;
    for (const type of ['keydown', 'keyup']) keyboard.addEventListener(type, event => {
      if (event.key === 'Backspace' || event.key === 'Delete') deletion = type === 'keydown' ? event.key : undefined;
      if (!event.ctrlKey && !event.metaKey && (event.key.length === 1 || event.isComposing || ['Unidentified', 'Process'].includes(event.key))) event.stopPropagation();
    });
    const commit = () => {
      if (composing) return;
      const text = keyboard.value;
      keyboard.value = '';
      for (const char of text) press(char);
    };
    keyboard.addEventListener('paste', event => event.stopPropagation());
    keyboard.addEventListener('input', event => {
      event.stopImmediatePropagation();
      if (!event.isComposing) commit();
    }, true);
    keyboard.addEventListener('compositionstart', () => { composing = true; });
    // Safari can end composition after its final input; defer so either event ordering commits only once.
    keyboard.addEventListener('compositionend', () => { composing = false; setTimeout(commit, 0); });
    keyboard.addEventListener('beforeinput', event => {
      const name = {deleteContentBackward: 'Backspace', deleteContentForward: 'Delete'}[event.inputType];
      // Android keyboards can report deletion only through beforeinput, without a Backspace key event.
      if (!composing && name && deletion !== name) press(name, name);
    });

    let x = 300, y = 325, pressed = false;
    const mouse = type => {
      const canvas = player.shadowRoot.querySelector('canvas');
      if (!canvas) throw new Error('Game canvas is not available for mobile aiming.');
      const box = canvas.getBoundingClientRect();
      cursor.style.left = `${x / 800 * 100}%`;
      cursor.style.top = `${y / 600 * 100}%`;
      cursor.hidden = false;
      // An inactive ID prevents Ruffle's capture from stealing the real thumb touch.
      canvas.dispatchEvent(new PointerEvent(type, {view: window, pointerId: 9999, pointerType: 'mouse', isPrimary: true, button: 0, buttons: pressed ? 1 : 0, bubbles: true, composed: true,
        clientX: box.left + x / 800 * box.width, clientY: box.top + y / 600 * box.height}));
    };
    const track = (element, move, end) => {
      let pointer;
      const release = () => {
        if (pointer === undefined) return;
        const id = pointer;
        pointer = undefined;
        delete element.dataset.pointer;
        element.style.removeProperty('--u'); element.style.removeProperty('--v');
        end();
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      };
      releases.push(release);
      const at = event => {
        const box = element.getBoundingClientRect();
        const u = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        const v = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        element.style.setProperty('--u', u); element.style.setProperty('--v', v);
        move(u, v, event.type);
      };
      element.addEventListener('pointerdown', event => {
        event.preventDefault();
        if (pointer !== undefined) return;
        pointer = event.pointerId;
        element.dataset.pointer = pointer;
        element.setPointerCapture(pointer);
        at(event);
      });
      element.addEventListener('pointermove', event => { if (event.pointerId === pointer) at(event); });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, event => { if (event.pointerId === pointer) release(); });
    };
    const releaseAll = () => releases.forEach(release => release());
    addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
    const move = (u, v) => {
      const x = u - .5, y = v - .5, length = Math.hypot(x, y);
      // sin(22.5°) divides the stick into eight directions, outside its dead zone.
      const near = length > .12 ? .383 * length : Infinity;
      const up = y < -near, left = x < -near, right = x > near;
      key('KeyW', up); key('KeyS', y > near);
      key('KeyA', left && !(cameraMode && up)); key('KeyD', right && !(cameraMode && up));
      key('KeyQ', cameraMode && up && left); key('KeyE', cameraMode && up && right);
    };
    track(document.querySelector('#move-stick'), move, () => move(.5, .5));
    let dx = 0, dy = 0, frame, last;
    const tick = now => {
      const length = Math.hypot(dx, dy);
      const speed = length > .12 ? 650 * Math.min(1, (length - .12) / .38) / length : 0;
      const dt = Math.min((now - last) / 1000, .05);
      last = now;
      x = Math.min(799, Math.max(0, x + dx * speed * dt));
      y = Math.min(599, Math.max(0, y + dy * speed * dt));
      mouse('pointermove');
      frame = requestAnimationFrame(tick);
    };
    track(document.querySelector('#aim-pad'), (u, v, type) => {
      dx = u - .5; dy = v - .5;
      if (type !== 'pointerdown') return;
      player.focus({preventScroll: true});
      mouse('pointerenter'); mouse('pointermove');
      pressed = true;
      mouse('pointerdown');
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }, () => {
      cancelAnimationFrame(frame);
      pressed = false;
      mouse('pointerup');
    });
    for (const button of document.querySelectorAll('#mobile-controls [data-code]')) track(button, () => key(button.dataset.code, true), () => key(button.dataset.code, false));
    const cameraButton = document.querySelector('#mobile-camera');
    const camera = enabled => {
      const api = player.ruffle();
      let acknowledged = false;
      api.traceObserver = message => { if (message === `openrotmg.camera:${enabled ? 'on' : 'off'}`) acknowledged = true; };
      player.focus({preventScroll: true});
      try { press(enabled ? 'F13' : 'F14', enabled ? 'F13' : 'F14'); }
      finally { api.traceObserver = null; }
      const notice = document.querySelector('#load-error');
      const message = 'Camera rotate is unavailable. Wait for the client to finish loading, then try again.';
      if (!acknowledged) {
        notice.textContent = message; notice.hidden = false;
        throw new Error(message);
      }
      if (notice.textContent === message) notice.hidden = true;
      cameraMode = enabled;
      cameraButton.setAttribute('aria-pressed', String(enabled));
    };
    cameraButton.addEventListener('click', () => { releaseAll(); camera(!cameraMode); });
    const keyboardButton = document.querySelector('#mobile-keyboard');
    for (const button of [keyboardButton, cameraButton]) button.addEventListener('pointerdown', event => event.preventDefault());
    keyboardButton.addEventListener('click', () => {
      releaseAll();
      // Do not send Enter: a keyboard is also needed for shortcuts and login fields, not just chat.
      keyboard.style.fontSize = '16px';
      player.focus({preventScroll: true});
      keyboard.focus({preventScroll: true});
    });
    const block = event => event.preventDefault();
    const enter = () => {
      root.classList.add('mobile');
      viewport.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
      document.addEventListener('gesturestart', block);
      document.addEventListener('touchmove', block, {passive: false});
    };
    document.querySelector('#mobile-exit').addEventListener('click', () => {
      releaseAll();
      if (cameraMode) camera(false);
      root.classList.remove('mobile');
      viewport.content = desktopViewport;
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('touchmove', block);
      if (document.fullscreenElement) void document.exitFullscreen().catch(error => console.error('Leaving fullscreen failed', error));
    });
    link.addEventListener('click', event => {
      event.preventDefault(); enter();
      if (document.fullscreenEnabled) void root.requestFullscreen({navigationUI: 'hide'}).catch(error => console.error('Fullscreen request failed', error));
    });
    if (location.hash === '#mobile-controls') enter();
  }
};
