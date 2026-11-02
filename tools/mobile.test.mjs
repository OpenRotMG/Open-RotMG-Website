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
  const sent = [], timers = [], frames = new Map(), events = element();
  const canvas = {getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 300}), dispatchEvent: event => sent.push(event)};
  let focused = 0, now = 0, sequence = 0, settings = [true, false], previous;
  const api = {};
  const shadowRoot = {activeElement: null, querySelector: selector => selector === 'canvas' ? canvas : keyboard};
  const keyboard = Object.assign(element(), {value: '', focus(options) { assert.equal(options.preventScroll, true); shadowRoot.activeElement = this; }});
  // The real runtime registers this before mobile controls. Capture must suppress its duplicate insertion path.
  keyboard.addEventListener('input', () => { throw Error('Ruffle input handler must not receive the same text again'); });
  const document = {...element(), documentElement: {classList: new Set()}, fullscreenEnabled: false,
    querySelector: selector => { assert(selector in nodes, selector); return nodes[selector]; }, querySelectorAll: () => buttons};
  document.documentElement.classList.remove = document.documentElement.classList.delete;
  const player = {focus: () => focused++, shadowRoot, ruffle: () => api, dispatchEvent(event) {
    sent.push(event);
    if (event.type !== 'keydown') return;
    if (event.code === 'F13') {previous ??= settings; settings = [false, true]; api.traceObserver?.('openrotmg.camera:on');}
    if (event.code === 'F14') {settings = previous; previous = undefined; api.traceObserver?.('openrotmg.camera:off');}
  }};
  const context = {window: {}, location: {hash}, console, document, performance: {now: () => now},
    KeyboardEvent: class { constructor(type, init) { Object.assign(this, {type, ...init}); } }, PointerEvent: class { constructor(type, init) { Object.assign(this, {type, ...init}); } },
    addEventListener: events.addEventListener.bind(events), requestAnimationFrame: fn => { frames.set(++sequence, fn); return sequence; }, cancelAnimationFrame: id => frames.delete(id), setTimeout: fn => timers.push(fn)};
  runInNewContext(readFileSync(new URL('../public/mobile.js', import.meta.url), 'utf8'), context);
  context.window.OpenRotMGMobile.start(player);
  const advance = ms => { for (let t = 0; t < ms; t += 20) { now += 20; const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(now)); } };
  return {...nodes, buttons, sent, shadowRoot, keyboard, document, events, api, root: document.documentElement, focused: () => focused, advance, settings: () => settings,
    flush: () => {while (timers.length) timers.shift()();},
    keys: () => sent.filter(event => event.type.startsWith('key') && !['F13', 'F14'].includes(event.code)).map(event => `${event.type === 'keydown' ? '+' : '-'}${event.code || event.key}`)};
}

const down = (element, pointerId, clientX, clientY) => element.fire('pointerdown', {pointerId, clientX, clientY});

test('mouse joystick moves continuously without teleporting, reaches the sidebar, and retains its position', () => {
  const f = fixture(), stick = f['#move-stick'], aim = f['#aim-pad'];
  down(stick, 1, 90, 10);
  down(aim, 2, 300, 50);
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyD']);
  assert.equal(f.sent.at(-1).clientX, 150, 'pressing the right edge starts at the retained cursor, not the edge');
  f.advance(1000);
  assert.equal(f['#aim-cursor'].style.left, '99.875%', 'the minimap and inventory are reachable');
  const last = f.sent.at(-1).clientX;
  aim.fire('pointermove', {pointerId: 2, clientX: 250, clientY: 50});
  f.advance(100);
  assert.equal(f.sent.at(-1).clientX, last, 'neutral stick stops the cursor');
  aim.fire('pointerup', {pointerId: 2});
  assert.equal(f.sent.at(-1).type, 'pointerup');
  assert.equal(f.sent.at(-1).buttons, 0);
  down(aim, 3, 250, 50);
  aim.fire('pointerup', {pointerId: 3});
  assert.deepEqual(f.sent.slice(-4).map(event => [event.type, event.clientX]), [['pointerenter', last], ['pointermove', last], ['pointerdown', last], ['pointerup', last]], 'a neutral tap clicks the sidebar at the retained cursor');
  stick.fire('pointercancel', {pointerId: 1});
  assert.deepEqual(f.keys().slice(-2), ['-KeyW', '-KeyD']);
});

test('camera mode changes actual native settings, maps forward diagonals to Q/E, and restores settings on exit', () => {
  const f = fixture(), stick = f['#move-stick'];
  f['#mobile-camera'].fire('click');
  assert.deepEqual(f.settings(), [false, true]);
  assert.equal(f['#mobile-camera'].attributes['aria-pressed'], 'true');
  down(stick, 1, 10, 10);
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyQ']);
  stick.fire('pointermove', {pointerId: 1, clientX: 90, clientY: 10});
  assert.deepEqual(f.keys().slice(-2), ['-KeyQ', '+KeyE']);
  stick.fire('pointermove', {pointerId: 1, clientX: 0, clientY: 50});
  assert.deepEqual(f.keys().slice(-3), ['-KeyW', '+KeyA', '-KeyE']);
  stick.fire('pointermove', {pointerId: 1, clientX: 10, clientY: 90});
  assert.equal(f.keys().at(-1), '+KeyS');
  f['#mobile-exit'].fire('click');
  assert.deepEqual(f.settings(), [true, false]);
  assert.equal(f['#mobile-camera'].attributes['aria-pressed'], 'false');
  assert.deepEqual(f.keys().slice(-2), ['-KeyS', '-KeyA']);
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
    f.keyboard.fire('beforeinput', {inputType: 'deleteContentBackward'});
    assert.deepEqual(f.keys().slice(-2), ['+Backspace', '-Backspace']);
    f.keyboard.fire('keydown', {key: 'Backspace'});
    f.keyboard.fire('beforeinput', {inputType: 'deleteContentBackward'});
    assert.equal(f.keys().length, 4, 'an identified native Backspace is not also synthesized');
  }
});

test('independent thumbs, cancellation and backgrounding release all held input', () => {
  const f = fixture(), stick = f['#move-stick'], aim = f['#aim-pad'];
  down(stick, 1, 90, 10); down(stick, 3, 0, 50);
  down(aim, 2, 300, 50); f.advance(20);
  down(f.buttons[1], 4, 1, 1);
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyD', '+Space']);
  f.events.fire('blur');
  assert.deepEqual(f.keys().slice(-3), ['-KeyW', '-KeyD', '-Space']);
  assert.equal(f.sent.findLast(event => event.type.startsWith('pointer')).type, 'pointerup');
  assert.equal(aim.dataset.pointer, undefined);
  const count = f.sent.length;
  f.advance(100); assert.equal(f.sent.length, count);
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
