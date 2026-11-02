import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function fixture(hash = '') {
  const element = (box = {left: 0, top: 0, width: 100, height: 100}) => ({listeners: {}, dataset: {}, style: {setProperty() {}, removeProperty() {}},
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }, removeEventListener(type, fn) { this.listeners[type] = this.listeners[type].filter(f => f !== fn); },
    fire(type, event) { for (const fn of this.listeners[type] ?? []) fn({type, preventDefault() {}, ...event}); }, setPointerCapture() {}, getBoundingClientRect: () => box});
  const nodes = {'#move-stick': element(), '#aim-pad': element({left: 200, top: 0, width: 100, height: 100}), '#mobile-exit': element(), 'a[href="/#mobile-controls"]': element(), 'meta[name="viewport"]': {content: 'width=device-width, initial-scale=1'}};
  const buttons = [Object.assign(element(), {dataset: {code: 'Insert'}}), Object.assign(element(), {dataset: {code: 'Space'}})];
  const sent = [], canvas = {getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 300}), dispatchEvent: event => sent.push(event)};
  let focused = 0;
  const context = {window: {dispatchEvent: event => sent.push(event)}, location: {hash}, console,
    KeyboardEvent: class { constructor(type, init) { Object.assign(this, {type, ...init}); } }, PointerEvent: class { constructor(type, init) { Object.assign(this, {type, ...init}); } },
    document: {documentElement: {classList: new Set()}, fullscreenEnabled: false, addEventListener() {}, removeEventListener() {}, querySelector: selector => { assert(selector in nodes, selector); return nodes[selector]; }, querySelectorAll: () => buttons}};
  context.document.documentElement.classList.remove = context.document.documentElement.classList.delete;
  runInNewContext(readFileSync(new URL('../public/mobile.js', import.meta.url), 'utf8'), context);
  context.window.OpenRotMGMobile.start({focus: () => focused++, shadowRoot: {querySelector: () => canvas}});
  return {...nodes, buttons, sent, root: context.document.documentElement, focused: () => focused,
    keys: () => sent.filter(event => event.type.startsWith('key')).map(event => `${event.type === 'keydown' ? '+' : '-'}${event.code}`)};
}

test('stick holds eight-way WASD while the aim pad follows a second thumb', () => {
  const f = fixture(), stick = f['#move-stick'], pad = f['#aim-pad'];
  stick.fire('pointerdown', {pointerId: 1, clientX: 50, clientY: 52});
  assert.deepEqual(f.keys(), [], 'the centre is a dead zone');
  stick.fire('pointermove', {pointerId: 1, clientX: 90, clientY: 10});
  pad.fire('pointerdown', {pointerId: 2, clientX: 200, clientY: 50});
  stick.fire('pointerdown', {pointerId: 3, clientX: 0, clientY: 50});
  stick.fire('pointermove', {pointerId: 1, clientX: 50, clientY: 95});
  assert.deepEqual(f.keys(), ['+KeyW', '+KeyD', '-KeyW', '+KeyS', '-KeyD'], 'diagonals press two keys and a second finger on the stick is ignored');
  // The pad's left edge aims 300 stage pixels left of the player at (300, 325) on the 800x600 stage.
  assert.deepEqual(f.sent.filter(event => event.type.startsWith('pointer')).map(event => [event.type, event.clientX, event.clientY, event.pointerType]),
    [['pointerenter', 0, 162.5, 'mouse'], ['pointermove', 0, 162.5, 'mouse'], ['pointerdown', 0, 162.5, 'mouse']]);
  pad.fire('pointermove', {pointerId: 1, clientX: 300, clientY: 0});
  pad.fire('pointermove', {pointerId: 2, clientX: 300, clientY: 0});
  pad.fire('lostpointercapture', {pointerId: 2});
  assert.deepEqual(f.sent.slice(-2).map(event => [event.type, event.clientX, event.clientY, event.buttons]), [['pointermove', 299.5, 12.5, 1], ['pointerup', 299.5, 12.5, 0]]);
  stick.fire('lostpointercapture', {pointerId: 1});
  assert.deepEqual(f.keys().slice(-1), ['-KeyS']);
  assert.equal(stick.dataset.pointer, undefined);
});

test('buttons hold Nexus and ability keys with the game focused', () => {
  const f = fixture();
  f.buttons[1].fire('pointerdown', {pointerId: 4, clientX: 1, clientY: 1});
  f.buttons[0].fire('pointerdown', {pointerId: 5, clientX: 1, clientY: 1});
  f.buttons[1].fire('lostpointercapture', {pointerId: 4});
  assert.deepEqual(f.keys(), ['+Space', '+Insert', '-Space']);
  assert.equal(f.focused(), 3);
});

test('the footer link and a shared link enter mobile mode, and exit restores the page', () => {
  const f = fixture();
  assert(!f.root.classList.has('mobile'));
  f['a[href="/#mobile-controls"]'].fire('click', {});
  assert(f.root.classList.has('mobile'));
  assert.match(f['meta[name="viewport"]'].content, /user-scalable=no/);
  f['#mobile-exit'].fire('click', {});
  assert(!f.root.classList.has('mobile'));
  assert.equal(f['meta[name="viewport"]'].content, 'width=device-width, initial-scale=1');
  assert(fixture('#mobile-controls').root.classList.has('mobile'));
});
