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
    const names = {KeyQ: 'q', KeyE: 'e', Insert: 'Insert', Space: ' '};
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
    const native = (code, character = code) => {
      const api = player.ruffle(), observer = api.traceObserver;
      let reply;
      api.traceObserver = message => { if (message.startsWith('openrotmg.')) reply = message; };
      try { press(character, code); }
      finally { api.traceObserver = observer; }
      return reply;
    };
    const acknowledged = (reply, expected, control) => {
      const notice = document.querySelector('#load-error');
      const message = `${control} is unavailable. Enter the game, or reload the client and try again.`;
      if (reply !== expected) {
        notice.textContent = message; notice.hidden = false;
        throw new Error(`${message} Expected ${expected}; received ${String(reply)}.`);
      }
      if (notice.textContent === message) notice.hidden = true;
    };
    const editingText = () => {
      const reply = native('F15');
      if (reply === 'openrotmg.keyboard:text') return true;
      if (reply === 'openrotmg.keyboard:shortcuts') return false;
      throw new Error('Native keyboard focus is unavailable. Reload the game client.');
    };

    // Native keys and Ruffle's input listener both insert text. Text fields receive only committed input.
    let composing = false, deletion, shortcutPrefix = '';
    const sendShortcuts = text => {
      if (!root.classList.contains('mobile') || !/^[a-z0-9]*$/i.test(text) || editingText()) return;
      for (const char of text.slice(shortcutPrefix.length)) press(char);
      shortcutPrefix = text;
    };
    for (const type of ['keydown', 'keyup']) keyboard.addEventListener(type, event => {
      if (event.key === 'Backspace' || event.key === 'Delete') deletion = type === 'keydown' ? event.key : undefined;
      if (!event.ctrlKey && !event.metaKey && (event.key.length === 1 || event.isComposing || ['Unidentified', 'Process'].includes(event.key))) event.stopPropagation();
    });
    const commit = () => {
      if (composing) return;
      const text = keyboard.value;
      keyboard.value = '';
      const sent = text.toLowerCase().startsWith(shortcutPrefix.toLowerCase()) ? shortcutPrefix.length : 0;
      shortcutPrefix = '';
      for (const char of text.slice(sent)) press(char);
    };
    keyboard.addEventListener('paste', event => event.stopPropagation());
    keyboard.addEventListener('input', event => {
      event.stopImmediatePropagation();
      if (composing || event.isComposing) {
        const text = keyboard.value;
        // Phone IMEs buffer single letters such as I; shortcuts must act immediately, but never inside a text field.
        sendShortcuts(text);
      } else commit();
    }, true);
    keyboard.addEventListener('compositionstart', () => { composing = true; shortcutPrefix = ''; });
    // Safari can end composition after its final input; defer so either event ordering commits only once.
    keyboard.addEventListener('compositionend', () => { composing = false; setTimeout(commit, 0); });
    keyboard.addEventListener('beforeinput', event => {
      if (event.inputType === 'insertCompositionText' && typeof event.data === 'string') sendShortcuts(event.data);
      const name = {deleteContentBackward: 'Backspace', deleteContentForward: 'Delete'}[event.inputType];
      // Android keyboards can report deletion only through beforeinput, without a Backspace key event.
      if (!composing && name && deletion !== name) press(name, name);
    });

    let x = 300, y = 325, pressed = false;
    const rotationDeadZone = .08;
    const drawCursor = () => {
      cursor.style.left = `${x / 800 * 100}%`;
      cursor.style.top = `${y / 600 * 100}%`;
      cursor.hidden = false;
    };
    // Only taps/drags set aim; incidental hover after the phone keyboard closes must not overwrite it.
    for (const type of ['pointerdown', 'pointermove']) player.addEventListener(type, event => {
      const canvas = player.shadowRoot.querySelector('canvas');
      if (!root.classList.contains('mobile') || !event.isTrusted || event.composedPath()[0] !== canvas) return;
      if (event.type === 'pointermove' && !event.buttons) { event.stopImmediatePropagation(); return; }
      const box = canvas.getBoundingClientRect();
      x = Math.min(799, Math.max(0, (event.clientX - box.left) / box.width * 800));
      y = Math.min(599, Math.max(0, (event.clientY - box.top) / box.height * 600));
      drawCursor();
    }, true);
    const mouse = type => {
      const canvas = player.shadowRoot.querySelector('canvas');
      if (!canvas) throw new Error('Game canvas is not available for mobile aiming.');
      const box = canvas.getBoundingClientRect();
      drawCursor();
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
        move(u, v, event.type, event);
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
    let moving = false;
    const stopMove = () => {
      if (!moving) return;
      moving = false;
      player.focus({preventScroll: true});
      acknowledged(native('F17'), 'openrotmg.move:off', 'Movement');
    };
    const move = (u, v) => {
      const x = u - .5, y = v - .5;
      if (Math.hypot(x, y) <= .12) { stopMove(); return; }
      if (!moving) {
        player.focus({preventScroll: true});
        const reply = native('F16');
        if (reply === 'openrotmg.move:idle') return;
        acknowledged(reply, 'openrotmg.move:ready', 'Movement');
        moving = true;
      }
      // The native bridge retains input gating and status effects, without quantizing the stick to WASD.
      const angle = (Math.round(Math.atan2(y, x) / (2 * Math.PI) * 3600) + 3600) % 3600;
      const reply = native('F16', String.fromCharCode(0xe000 + angle));
      if (reply !== 'openrotmg.move:direction') stopMove();
      acknowledged(reply, 'openrotmg.move:direction', 'Movement');
    };
    track(document.querySelector('#move-stick'), move, stopMove);
    let lastX, lastY, startX, startY, rotationX, activation, ready = false, dragging = false;
    const rotate = () => {
      if (!cameraMode || !ready) return;
      key('KeyQ', rotationX < .5 - rotationDeadZone); key('KeyE', rotationX > .5 + rotationDeadZone);
    };
    track(document.querySelector('#aim-pad'), (u, v, type, event) => {
      rotationX = u;
      if (type === 'pointerdown') {
        ready = dragging = false;
        startX = event.clientX; startY = event.clientY;
        // Quick taps click in place; only a held gesture can steer or rotate.
        activation = setTimeout(() => { ready = true; rotate(); }, 150);
        player.focus({preventScroll: true});
        mouse('pointerenter'); mouse('pointermove');
        pressed = true;
        mouse('pointerdown');
      } else if (!cameraMode && ready && (dragging || Math.hypot(event.clientX - startX, event.clientY - startY) > 8)) {
        dragging = true;
        const area = player.getBoundingClientRect();
        // A fixed 1.5× thumb-to-cursor ratio has no time dependence, acceleration or drift.
        x = Math.min(799, Math.max(0, x + (event.clientX - lastX) * 800 / area.width * 1.5));
        y = Math.min(599, Math.max(0, y + (event.clientY - lastY) * 600 / area.height * 1.5));
        mouse('pointermove');
      }
      lastX = event.clientX; lastY = event.clientY;
      rotate();
    }, () => {
      clearTimeout(activation);
      ready = false;
      key('KeyQ', false); key('KeyE', false);
      pressed = false;
      // The real thumb is outside the canvas; Ruffle must hit the game map, not just the stage, on release.
      mouse('pointerenter'); mouse('pointerup');
    });
    for (const button of document.querySelectorAll('#mobile-controls [data-code]')) track(button, () => key(button.dataset.code, true), () => key(button.dataset.code, false));
    const cameraButton = document.querySelector('#mobile-camera');
    const camera = enabled => {
      player.focus({preventScroll: true});
      const acknowledged = native(enabled ? 'F13' : 'F14') === `openrotmg.camera:${enabled ? 'on' : 'off'}`;
      const notice = document.querySelector('#load-error');
      const message = 'Camera rotate is unavailable. Wait for the client to finish loading, then try again.';
      if (!acknowledged) {
        notice.textContent = message; notice.hidden = false;
        throw new Error(message);
      }
      if (notice.textContent === message) notice.hidden = true;
      cameraMode = enabled;
      if (enabled) { x = 300; y = 150; mouse('pointerenter'); mouse('pointermove'); }
      cameraButton.setAttribute('aria-pressed', String(enabled));
    };
    cameraButton.addEventListener('click', () => { releaseAll(); camera(!cameraMode); });
    const keyboardButton = document.querySelector('#mobile-keyboard');
    const chatButton = document.querySelector('#mobile-chat');
    const zoomIn = document.querySelector('#mobile-zoom-in'), zoomOut = document.querySelector('#mobile-zoom-out');
    for (const button of [keyboardButton, cameraButton, chatButton, zoomIn, zoomOut]) button.addEventListener('pointerdown', event => event.preventDefault());
    const openKeyboard = () => {
      releaseAll();
      // Do not send Enter: a keyboard is also needed for shortcuts and login fields, not just chat.
      keyboard.style.fontSize = '16px';
      player.focus({preventScroll: true});
      keyboard.focus({preventScroll: true});
    };
    keyboardButton.addEventListener('click', openKeyboard);
    chatButton.addEventListener('click', () => {
      releaseAll(); player.focus({preventScroll: true});
      acknowledged(native('F20'), 'openrotmg.chat:ready', 'Chat');
      openKeyboard();
    });
    for (const [button, code] of [[zoomIn, 'F18'], [zoomOut, 'F19']]) button.addEventListener('click', () => {
      releaseAll(); player.focus({preventScroll: true});
      acknowledged(native(code), 'openrotmg.zoom:done', 'Minimap zoom');
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
