import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(hash = '') {
  const element = (box = {left: 0, top: 0, width: 100, height: 100}) => ({listeners: {}, dataset: {}, attributes: {}, style: {setProperty() {}, removeProperty() {}},
    addEventListener(type, fn, capture) { (this.listeners[type] ??= []).push({fn, capture}); },
    removeEventListener(type, fn) {this.listeners[type] = (this.listeners[type] ?? []).filter(listener => listener.fn !== fn);},
    fire(type, event = {}) {
      const e = {type, key: '', preventDefault() {}, stopPropagation() {this.stopped = true;}, stopImmediatePropagation() {this.immediate = true;}, ...event};
      for (const {fn} of [...this.listeners[type] ?? []].sort((a, b) => Boolean(b.capture) - Boolean(a.capture))) { fn(e); if (e.immediate) break; }
      return e;
    },
    setAttribute(name, value) {this.attributes[name] = value;},
    setPointerCapture(id) {this.capture = id;}, hasPointerCapture(id) {return this.capture === id;}, releasePointerCapture() {delete this.capture;}, getBoundingClientRect: () => box});
  const nodes = {'#load-error': {...element(), hidden: true}, '#aim-cursor': {...element(), hidden: true}, '#mobile-keyboard': element(), '#mobile-camera': element(), '#move-stick': element(), '#aim-pad': element({left: 200, top: 0, width: 100, height: 100}), '#mobile-exit': element(), 'a[href="/#mobile-controls"]': element(), 'meta[name="viewport"]': {content: 'width=device-width, initial-scale=1'}};
  const buttons = [Object.assign(element(), {dataset: {code: 'Insert'}}), Object.assign(element(), {dataset: {code: 'Space'}})];
  const sent = [], timers = new Map(), events = element();
  let now = 0, sequence = 0;
  const advance = ms => { now += ms; for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.fn(); } };
  const canvas = {getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 300}), dispatchEvent: event => sent.push(event)};
  let focused = 0, settings = [true, false, 0, 0];
  const api = {textFocused: true};
  const shadowRoot = {activeElement: null, querySelector: selector => selector === 'canvas' ? canvas : keyboard};
  const keyboard = Object.assign(element(), {value: '', focus(options) { assert.equal(options.preventScroll, true); shadowRoot.activeElement = this; }});
  // The real runtime registers this before mobile controls. Capture must suppress its duplicate insertion path.
  keyboard.addEventListener('input', () => { throw Error('Ruffle input handler must not receive the same text again'); });
  const document = {...element(), documentElement: {classList: new Set()}, fullscreenEnabled: false,
    querySelector: selector => { assert(selector in nodes, selector); return nodes[selector]; }, querySelectorAll: () => buttons};
  document.documentElement.classList.remove = document.documentElement.classList.delete;
  document.documentElement.classList.contains = document.documentElement.classList.has;
  const player = {...element({left: 0, top: 0, width: 400, height: 300}), focus: () => focused++, shadowRoot, ruffle: () => api, dispatchEvent(event) {
    sent.push(event);
    if (event.type !== 'keydown') return;
    if (event.code === 'F13') {settings = [false, true, settings[2], settings[3]]; api.traceObserver?.('openrotmg.camera:on');}
    if (event.code === 'F14') {settings = [true, false, 0, 0]; api.traceObserver?.('openrotmg.camera:off');}
    if (event.code === 'F15') api.traceObserver?.(`openrotmg.keyboard:${api.textFocused ? 'text' : 'shortcuts'}`);
  }};
  const context = {window: {}, location: {hash}, console, document,
    KeyboardEvent: class { constructor(type, init) { Object.assign(this, {type, ...init}); } }, PointerEvent: class { constructor(type, init) { Object.assign(this, {type, ...init}); } },
    addEventListener: events.addEventListener.bind(events), setTimeout: (fn, delay = 0) => { timers.set(++sequence, {fn, at: now + delay}); return sequence; }, clearTimeout: id => timers.delete(id)};
  runInNewContext(readFileSync(new URL('../public/mobile.js', import.meta.url), 'utf8'), context);
  context.window.OpenRotMGMobile.start(player);
  return {...nodes, buttons, sent, shadowRoot, keyboard, document, events, api, player, canvas, root: document.documentElement, focused: () => focused, settings: () => settings, setSettings: value => { settings = value; },
    advance, flush: () => advance(0),
    keys: () => sent.filter(event => event.type.startsWith('key') && !['F13', 'F14', 'F15'].includes(event.code)).map(event => `${event.type === 'keydown' ? '+' : '-'}${event.code || event.key}`)};
}

const down = (element, pointerId, clientX, clientY) => element.fire('pointerdown', {pointerId, clientX, clientY});

test('mouse control follows dragging without teleporting, reaches the sidebar, and retains its position', () => {
  const f = fixture(), stick = f['#move-stick'], aim = f['#aim-pad'];
  down(stick, 1, 90, 10);
  down(aim, 2, 200, 50);
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyD']);
  assert.equal(f.sent.at(-1).clientX, 150, 'pressing anywhere starts at the retained cursor');
  f.advance(150);
  aim.fire('pointermove', {pointerId: 2, clientX: 400, clientY: 50});
  assert.equal(f['#aim-cursor'].style.left, '99.875%', 'the minimap and inventory are reachable');
  const last = f.sent.at(-1).clientX;
  aim.fire('pointermove', {pointerId: 2, clientX: 400, clientY: 50});
  assert.equal(f.sent.at(-1).clientX, last, 'holding still must not drift');
  aim.fire('pointerup', {pointerId: 2});
  assert.equal(f.sent.at(-1).type, 'pointerup');
  assert.equal(f.sent.at(-1).buttons, 0);
  down(aim, 3, 250, 50);
  aim.fire('pointerup', {pointerId: 3});
  assert.deepEqual(f.sent.slice(-5).map(event => [event.type, event.clientX]), [['pointerenter', last], ['pointermove', last], ['pointerdown', last], ['pointerenter', last], ['pointerup', last]], 'a neutral tap clicks the sidebar at the retained cursor');
  stick.fire('pointercancel', {pointerId: 1});
  assert.deepEqual(f.keys().slice(-2), ['-KeyW', '-KeyD']);
});

test('camera mode aims forward, holds fire, keeps left-stick WASD, and rotates with the right stick', () => {
  const f = fixture(), stick = f['#move-stick'], aim = f['#aim-pad'];
  f['#mobile-camera'].fire('click');
  assert.deepEqual(f.settings(), [false, true, 0, 0]);
  assert.equal(f['#mobile-camera'].attributes['aria-pressed'], 'true');
  assert.equal(f['#aim-cursor'].style.left, '37.5%');
  assert.equal(f['#aim-cursor'].style.top, '25%');
  down(stick, 1, 10, 10);
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyA']);
  const pointers = f.sent.filter(e => e.type.startsWith('pointer')).length;
  down(aim, 2, 200, 50);
  f.advance(150);
  assert.equal(f.keys().at(-1), '+KeyQ');
  aim.fire('pointermove', {pointerId: 2, clientX: 300, clientY: 50});
  assert.deepEqual(f.keys().slice(-2), ['-KeyQ', '+KeyE']);
  aim.fire('pointermove', {pointerId: 2, clientX: 250, clientY: 0});
  assert.equal(f.keys().at(-1), '-KeyE');
  assert.deepEqual(f.sent.filter(e => e.type.startsWith('pointer')).slice(pointers).map(e => [e.type, e.buttons]), [['pointerenter', 0], ['pointermove', 0], ['pointerdown', 1]], 'holding the rotation stick must also hold fire without moving the aim');
  assert.equal(f['#aim-cursor'].style.top, '25%');
  f.setSettings([false, true, 2, 1]);
  f['#mobile-exit'].fire('click');
  assert.deepEqual(f.settings(), [true, false, 0, 0], 'camera off resets angle and centering instead of restoring old settings');
  assert.equal(f.sent.findLast(e => e.type.startsWith('pointer')).type, 'pointerup');
  assert.equal(f['#mobile-camera'].attributes['aria-pressed'], 'false');
  assert.deepEqual(f.keys().slice(-2), ['-KeyW', '-KeyA']);
});

test('held mouse control tracks thumb displacement directly with precise small adjustments', () => {
  const f = fixture(), aim = f['#aim-pad'];
  down(aim, 1, 250, 50); f.advance(150);
  aim.fire('pointermove', {pointerId: 1, clientX: 261, clientY: 50});
  assert.equal(f.sent.at(-1).clientX, 166.5);
  aim.fire('pointermove', {pointerId: 1, clientX: 262, clientY: 50});
  assert.equal(f.sent.at(-1).clientX, 168, 'once dragging, one pixel of thumb movement immediately moves the cursor 1.5 pixels');
  aim.fire('pointermove', {pointerId: 1, clientX: 272, clientY: 60});
  assert.equal(f.sent.at(-1).clientX, 183);
  assert.equal(f.sent.at(-1).clientY, 177.5);
  f.advance(1000);
  assert.equal(f.sent.at(-1).clientX, 183, 'holding still must not drift');
});

test('quick taps and held thumb jitter click in place without movement or rotation', () => {
  for (const camera of [false, true]) {
    const f = fixture(), aim = f['#aim-pad'];
    if (camera) f['#mobile-camera'].fire('click');
    down(aim, 1, 290, 50);
    const position = f['#aim-cursor'].style.left;
    aim.fire('pointermove', {pointerId: 1, clientX: 295, clientY: 54});
    f.advance(100); aim.fire('pointerup', {pointerId: 1}); f.advance(1000);
    assert.equal(f['#aim-cursor'].style.left, position);
    assert.deepEqual(f.keys(), [], 'a released quick tap must never later activate rotation');
    assert.equal(f.sent.at(-1).type, 'pointerup');
  }
  const f = fixture(), aim = f['#aim-pad'];
  down(aim, 1, 250, 50); f.advance(500);
  aim.fire('pointermove', {pointerId: 1, clientX: 255, clientY: 54});
  assert.equal(f.sent.at(-1).type, 'pointerdown', 'held jitter inside eight pixels must not move the cursor');
});

test('real canvas taps teleport the cursor in either mode; synthetic events and UI overlays do not', () => {
  const f = fixture('#mobile-controls');
  f['#mobile-camera'].fire('click');
  const touch = {isTrusted: true, clientX: 340, clientY: 60, composedPath: () => [f.canvas]};
  f.player.fire('pointerdown', touch);
  assert.equal(f['#aim-cursor'].style.left, '85%');
  assert.equal(f['#aim-cursor'].style.top, '20%');
  down(f['#aim-pad'], 2, 300, 50);
  assert.equal(f['#aim-cursor'].style.left, '85%', 'rotation retains the point selected by a tap');
  assert.equal(f.player.fire('pointermove', {...touch, buttons: 0, clientX: 0}).immediate, true, 'idle mouse hover must not overwrite aim or reach Ruffle');
  f.player.fire('pointermove', {...touch, isTrusted: false, clientX: 0});
  f.player.fire('pointerdown', {...touch, composedPath: () => [f.keyboard], clientX: 0});
  assert.equal(f['#aim-cursor'].style.left, '85%');
  f['#mobile-camera'].fire('click');
  f.player.fire('pointerdown', {...touch, clientX: 100});
  assert.equal(f['#aim-cursor'].style.left, '25%');
});

test('missing native camera support is visible and never labels the mode enabled', () => {
  const f = fixture();
  Object.defineProperty(f.api, 'traceObserver', {set() {}});
  assert.throws(() => f['#mobile-camera'].fire('click'), /Camera rotate is unavailable/);
  assert.equal(f['#load-error'].hidden, false);
  assert.notEqual(f['#mobile-camera'].attributes['aria-pressed'], 'true');
});

test('keyboard opens without Enter, and native key plus input inserts each character only once', () => {
  const f = fixture();
  f['#mobile-keyboard'].fire('click');
  assert.deepEqual(f.keys(), []);
  assert.equal(f.shadowRoot.activeElement, f.keyboard);
  assert.equal(f.keyboard.style.fontSize, '16px');
  for (const char of 'test@example.com') {
    assert.equal(f.keyboard.fire('keydown', {key: char}).stopped, true);
    f.keyboard.value = char; f.keyboard.fire('input');
    assert.equal(f.keyboard.fire('keyup', {key: char}).stopped, true);
  }
  assert.deepEqual(f.keys(), [...'test@example.com'].flatMap(char => ['+' + char, '-' + char]));
  assert.equal(f.keyboard.value, '');
  assert.equal(f.keyboard.fire('paste').stopped, true, 'paste also uses the one committed-input path');
});

test('IME commits only once with either composition event ordering and supports Android deletion', () => {
  for (const trailingInput of [true, false]) {
    const f = fixture();
    f.keyboard.fire('compositionstart');
    for (const value of ['n', 'ni', '你']) { f.keyboard.value = value; f.keyboard.fire('input', {isComposing: true}); }
    assert.deepEqual(f.keys(), []);
    f.keyboard.fire('compositionend');
    if (trailingInput) f.keyboard.fire('input', {isComposing: false});
    f.flush();
    assert.deepEqual(f.keys(), ['+你', '-你']);
    assert(!f.sent.some(event => event.code === 'F15'), 'automatic text-field typing must not depend on native shortcut queries');
    f.keyboard.fire('beforeinput', {inputType: 'deleteContentBackward'});
    assert.deepEqual(f.keys().slice(-2), ['+Backspace', '-Backspace']);
    f.keyboard.fire('keydown', {key: 'Backspace'});
    f.keyboard.fire('beforeinput', {inputType: 'deleteContentBackward'});
    assert.equal(f.keys().length, 4, 'an identified native Backspace is not also synthesized');
  }
});

test('composing I toggles autofire immediately outside text fields and is not replayed on commit', () => {
  const f = fixture('#mobile-controls'); f.api.textFocused = false;
  f['#mobile-keyboard'].fire('click');
  f.player.fire('pointerdown', {isTrusted: true, clientX: 100, clientY: 80, composedPath: () => [f.canvas]});
  f.keyboard.fire('compositionstart');
  f.keyboard.fire('beforeinput', {inputType: 'insertCompositionText', data: 'i'});
  assert.deepEqual(f.keys(), ['+i', '-i'], 'the shortcut must not wait for the later input/Enter event');
  f.keyboard.value = 'i'; f.keyboard.fire('input', {isComposing: true});
  assert.deepEqual(f.keys(), ['+i', '-i']);
  f.keyboard.value = 'I'; f.keyboard.fire('input', {isComposing: true});
  assert.deepEqual(f.keys(), ['+i', '-i'], 'autocapitalization must not toggle autofire off again');
  f.keyboard.fire('compositionend'); f.keyboard.fire('input'); f.flush();
  assert.deepEqual(f.keys(), ['+i', '-i']);
  f.keyboard.fire('compositionstart'); f.keyboard.value = 'ii'; f.keyboard.fire('input', {isComposing: true});
  assert.deepEqual(f.keys(), ['+i', '-i', '+i', '-i', '+i', '-i'], 'repeated shortcuts must each act before composition ends');
  f.keyboard.fire('compositionend'); f.keyboard.fire('input'); f.flush();
  assert.equal(f.keys().length, 6);
  const text = fixture('#mobile-controls');
  text['#mobile-keyboard'].fire('click');
  text.keyboard.fire('compositionstart'); text.keyboard.value = 'i'; text.keyboard.fire('input', {isComposing: true});
  assert.deepEqual(text.keys(), [], 'login/chat text must still wait for its IME commit');
  text.keyboard.fire('compositionend'); text.keyboard.fire('input'); text.flush();
  assert.deepEqual(text.keys(), ['+i', '-i']);
});

test('independent thumbs, cancellation and backgrounding release all held input', () => {
  const f = fixture(), stick = f['#move-stick'], aim = f['#aim-pad'];
  down(stick, 1, 90, 10); down(stick, 3, 0, 50);
  down(aim, 2, 300, 50);
  down(f.buttons[1], 4, 1, 1);
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyD', '+Space']);
  f.events.fire('blur');
  assert.deepEqual(f.keys().slice(-3), ['-KeyW', '-KeyD', '-Space']);
  assert.equal(f.sent.findLast(event => event.type.startsWith('pointer')).type, 'pointerup');
  assert.equal(aim.dataset.pointer, undefined);
  const count = f.sent.length;
  aim.fire('pointermove', {pointerId: 2, clientX: 280, clientY: 50});
  assert.equal(f.sent.length, count, 'released pointers cannot move the cursor');
});

test('footer and shared links enter mobile mode, and exit restores the page', () => {
  const f = fixture();
  f['a[href="/#mobile-controls"]'].fire('click');
  assert(f.root.classList.has('mobile'));
  f['#mobile-exit'].fire('click');
  assert(!f.root.classList.has('mobile'));
  assert.equal(f['meta[name="viewport"]'].content, 'width=device-width, initial-scale=1');
  assert(fixture('#mobile-controls').root.classList.has('mobile'));
});
