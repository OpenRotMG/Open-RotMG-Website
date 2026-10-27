import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {events, viewMessage, selectionMessage, intentionRows, start} from '../public/bots/app.js';

test('bot stream parser keeps partial messages and skips keep-alive comments', () => {
  const [first, rest] = events('data: {"a":1}\n\n:\n\ndata: {"b"');
  assert.deepEqual(first, [{a: 1}]);
  assert.deepEqual(events(rest + ':2}\n\n'), [[{b: 2}], '']);
  assert.deepEqual(events('data: {"a":1}\r\n\r\n'), [[{a: 1}], '']);
  assert.throws(() => events('data: bad\n\n'), SyntaxError);
});

test('native messages require exact origin, window, bot and status schema', () => {
  const source = {}, data = {type: 'openrotmg-bot-view', bot: 'Alpha', status: 'live'};
  const event = {origin: 'https://game.test', source, data};
  const valid = change => viewMessage({...event, ...change}, event.origin, source, 'Alpha');
  assert.equal(valid({}), true);
  for (const status of ['connecting', 'live', 'stale', 'disconnected']) assert.equal(valid({data: {...data, status}}), true);
  assert.equal(valid({data: {...data, status: 'error', error: 'socket closed'}}), true);
  for (const change of [
    {origin: 'https://evil.test'}, {source: {}}, {source: null}, {data: null}, {data: []},
    ...[{bot: 'Beta'}, {type: 'other'}, {status: 'playing'}, {error: 1}, {status: 'error'}, {status: 'error', error: ''}, {extra: true}].map(patch => ({data: {...data, ...patch}})),
  ]) assert.equal(valid(change), false, JSON.stringify(change));
  assert.equal(viewMessage({...event, source: null}, event.origin, null, 'Alpha'), false);
});

class Node {
  constructor(tag = '') {this.tag = tag;this.children = [];this.textContent = '';this.listeners = {};this.attributes = {};if (tag === 'iframe') this.contentWindow = {};}
  set value(value) {this.selected = this.tag === 'select' && !this.children.some(child => child.value === value) ? '' : value;}
  get value() {return this.selected;}
  replaceChildren(...children) {this.children = children;for (const child of children) child.parent = this;if (this.tag === 'select') this.value = children[0]?.value ?? '';}
  appendChild(child) {this.children.push(child);child.parent = this;if (this.tag === 'select' && this.selected === undefined) this.value = child.value;return child;}
  setAttribute(key, value) {this.attributes[key] = value;}
  addEventListener(type, callback) {this.listeners[type] = callback;}
  removeEventListener(type) {delete this.listeners[type];}
}
const flush = () => new Promise(setImmediate);
const deferred = () => {let resolve;const promise = new Promise(done => {resolve = done;});return {promise, resolve};};
const intent = {goal: {id: 1, label: 'Max permanent Speed', current: 30, target: 50, unit: 'Speed'}, plan: 'Earn Speed potions in Snake Pits', step: 'adventuring: hunting quest Red Demon', mode: 'progress', reason: 'A known entrance is available', resume: null};
const frame = {character: 1, level: 3, class: 'Wizard', world: 'Realm', hp: 80, max_hp: 100, mp: 40, max_mp: 60, reason: 'exploring', aim: null, intent};
const bots = names => ({bots: names.map(name => ({name, frame, age_ms: 0})), llm: {enabled: false}});
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
function harness(t, query = '', initial = bots(['Alpha', 'Beta'])) {
  let clock = 0, nextTimer = 0;
  const nodes = Object.fromEntries(['bot', 'status', 'view', 'view-status', 'telemetry-status', 'intention', 'intention-status'].map(id => [`#${id}`, new Node(id === 'bot' ? 'select' : '')]));
  const listeners = {}, timers = new Map(), calls = [], lists = [json(initial)], streams = [], feeds = [];
  const window = {location: {search: query}, history: {replaceState(...args) {window.path = args[2];}},
    addEventListener(type, callback) {listeners[type] = callback;}, removeEventListener(type) {delete listeners[type];},
    setInterval(callback, ms) {timers.set(++nextTimer, {callback, ms, interval: true});return nextTimer;},
    setTimeout(callback, ms) {timers.set(++nextTimer, {callback, ms});return nextTimer;},
    clearTimeout(id) {timers.delete(id);}, clearInterval(id) {timers.delete(id);}};
  const backend = {url: path => new URL(path, 'https://game.test'), fetch: async (path, options) => {
    calls.push({path, options});
    if (path === '/api/bots') return lists.length ? await lists.shift() : json(bots(['Alpha', 'Beta']));
    if (streams.length) return await streams.shift();
    const stream = new ReadableStream({start(controller) {feeds.push(controller);}});
    return new Response(stream);
  }};
  const stop = start({document: {querySelector: key => nodes[key], createElement: tag => new Node(tag)}, window, backend, now: () => clock});
  t.after(stop);
  return {nodes, window, calls, lists, streams, feeds, timers,
    iframe: () => nodes['#view'].children[0],
    send(data, change = {}) {listeners.message({origin: 'https://game.test', source: nodes['#view'].children[0]?.contentWindow, data: {type: 'openrotmg-bot-view', bot: 'Alpha', status: 'live', ...data}, ...change});},
    choose(name) {nodes['#bot'].value = name;nodes['#bot'].listeners.change({target: nodes['#bot']});},
    async emit(update, feed = feeds.at(-1)) {feed.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(update)}\n\n`));await flush();},
    async advance(ms) {clock += ms;for (const [id, timer] of [...timers]) if (timer.ms <= ms && timers.has(id)) {if (!timer.interval) timers.delete(id);timer.callback();}await flush();},
  };
}

test('healthy native view and decisions are quiet; actual loading/stale/errors remain visible', async t => {
  const h = harness(t);await flush();
  assert.equal(h.iframe().src, 'https://game.test/api/bots/Alpha/view');
  assert.equal(h.iframe().attributes.sandbox, 'allow-scripts allow-same-origin');
  assert.match(h.iframe().attributes.allow, /camera 'none'/);
  assert.match(h.iframe().title, /Read-only.*Alpha/);
  assert.match(h.nodes['#view-status'].textContent, /Loading game view/);
  assert.equal(h.nodes['#status'].textContent, '');
  assert.deepEqual(h.nodes['#bot'].children.map(x => x.textContent), ['Alpha — Realm', 'Beta — Realm']);
  await h.emit({frame, age_ms: 0, thoughts: [{at: 0, text: 'Not displayed'}]});
  assert.equal(h.nodes['#telemetry-status'].textContent, '');
  h.send();assert.equal(h.nodes['#view-status'].textContent, '');
  await h.advance(16000);
  assert.match(h.nodes['#view-status'].textContent, /stale/);
  assert.match(h.nodes['#telemetry-status'].textContent, /Intentions stale/);
  h.send({status: 'disconnected'});assert.match(h.nodes['#view-status'].textContent, /disconnected/);
  h.send({status: 'error', error: 'overflow; reconnect required'});assert.match(h.nodes['#view-status'].textContent, /error.*overflow/);
  h.send({status: 'connecting'});assert.match(h.nodes['#view-status'].textContent, /Loading game view/);
});

test('picker discards old iframe/feed; forged and retired-window messages cannot repaint', async t => {
  const h = harness(t);await flush();await h.emit({frame, age_ms: 0});
  const old = h.iframe(), signal = h.calls[1].options.signal;
  h.choose('Beta');await flush();
  assert.equal(signal.aborted, true);assert.notEqual(h.iframe(), old);
  assert.equal(h.window.path, '?bot=Beta');assert.equal(h.nodes['#intention'].children.length, 0);
  for (const [data, change] of [[{bot: 'Alpha'}, {}], [{bot: 'Beta'}, {source: old.contentWindow}], [{bot: 'Beta'}, {origin: 'https://evil.test'}], [{bot: 'Beta', status: 'nonsense'}, {}]]) h.send(data, change);
  assert.match(h.nodes['#view-status'].textContent, /Loading game view/);
  await h.emit({frame, age_ms: 0}, h.feeds[0]);
  assert.equal(h.nodes['#intention'].children.length, 0);
  h.send({bot: 'Beta'});assert.equal(h.nodes['#view-status'].textContent, '');
  await h.emit({frame, age_ms: 0});assert.equal(h.nodes['#intention'].children.length, 1);
});

test('HTTP failure retry is canceled on selection and late responses never repaint', async t => {
  const h = harness(t);await flush();
  h.streams.push(new Response('not here', {status: 404}));h.choose('Beta');await flush();
  assert.match(h.nodes['#telemetry-status'].textContent, /unavailable.*HTTP 404.*Reconnecting in 5 s/);
  const late = deferred();h.streams.push(late.promise);h.choose('Alpha');await flush();h.choose('Beta');await flush();
  late.resolve(new Response('bad old response', {status: 500}));await flush();
  assert.equal(h.nodes['#telemetry-status'].textContent, '');
  const count = h.calls.filter(call => call.path.endsWith('/stream')).length;
  await h.advance(5000);assert.equal(h.calls.filter(call => call.path.endsWith('/stream')).length, count);
  assert.equal(h.nodes['#intention'].children.length, 0);assert.match(h.iframe().src, /Beta\/view$/);
});

test('malformed/closed SSE and missing decisions stay observable without history UI', async t => {
  const h = harness(t);await flush();await h.emit({frame, age_ms: 0});
  h.feeds[0].close();await flush();assert.match(h.nodes['#telemetry-status'].textContent, /server closed the stream/);
  await h.advance(5000);
  await h.emit({frame: null, age_ms: 0});assert.match(h.nodes['#intention-status'].textContent, /No decision intention/);
  await h.emit({frame, age_ms: -1});assert.match(h.nodes['#telemetry-status'].textContent, /malformed bot telemetry/);
});

test('missing query bot never substitutes another bot; availability loss resets display and can reconnect', async t => {
  const h = harness(t, '?bot=Missing');await flush();
  assert.equal(h.iframe(), undefined);assert.match(h.nodes['#status'].textContent, /Missing is offline/);
  assert.equal(h.nodes['#bot'].value, '');assert.equal(h.calls.length, 1);
  h.choose('Beta');await flush();await h.emit({frame, age_ms: 0, thoughts: [{at: 0, text: 'Beta thought'}]});
  h.lists.push(json(bots([])));await h.advance(10000);
  assert.equal(h.iframe(), undefined);assert.equal(h.nodes['#intention'].children.length, 0);
  assert.equal(h.nodes['#bot'].disabled, true);assert.match(h.nodes['#status'].textContent, /Beta is offline/);
  h.lists.push(json(bots(['Beta'])));await h.advance(10000);
  assert.match(h.iframe().src, /Beta\/view$/);assert.equal(h.nodes['#bot'].disabled, false);
});

test('out-of-order list responses cannot undo picker selection or newer availability', async t => {
  const h = harness(t);await flush();
  const late = deferred();h.lists.push(late.promise);await h.advance(10000);
  h.choose('Beta');await flush();h.lists.push(json(bots(['Beta'])));await h.advance(10000);
  const iframe = h.iframe();late.resolve(json(bots([])));await flush();
  assert.equal(h.iframe(), iframe);assert.equal(h.nodes['#bot'].value, 'Beta');
  h.lists.push(new Response('offline', {status: 503}));await h.advance(10000);
  assert.match(h.nodes['#status'].textContent, /Bot list error:.*HTTP 503/);assert.equal(h.iframe(), iframe);
});

test('bootstrap errors stay explicit; unrelated model statistics are not presentation dependencies', async t => {
  const h = harness(t);await flush();
  h.iframe().listeners.error();assert.match(h.nodes['#view-status'].textContent, /error.*failed to load/);
  h.choose('Beta');await flush();h.choose('Alpha');await flush();
  await h.advance(16000);assert.match(h.nodes['#view-status'].textContent, /error.*no native status/);
  const list = bots(['Alpha', 'Beta']);list.llm = {enabled: true, budget_scope: 'unknown'};
  h.lists.push(json(list));await h.advance(10000);
  assert.equal(h.nodes['#status'].textContent, '');assert.match(h.iframe().src, /Alpha\/view$/);
});

test('initial empty population and encoded query selection never invent a live feed', async t => {
  const empty = harness(t, '', bots([]));await flush();
  assert.equal(empty.iframe(), undefined);assert.match(empty.nodes['#status'].textContent, /No bots are running/);
  assert.equal(empty.nodes['#bot'].disabled, true);assert.equal(empty.calls.length, 1);
  const encoded = harness(t, '?bot=Alpha%20%26%20Beta', bots(['Alpha & Beta']));await flush();
  assert.equal(encoded.iframe().src, 'https://game.test/api/bots/Alpha%20%26%20Beta/view');
  assert.equal(encoded.calls[1].path, '/api/bots/Alpha%20%26%20Beta/stream');
});

test('locations update in place from SSE and catalogue without selection, URL or native reload churn', async t => {
  const h = harness(t, '?bot=Alpha');await flush();
  const picker = h.nodes['#bot'], [alpha, beta] = picker.children, iframe = h.iframe(), signal = h.calls[1].options.signal;
  picker.replaceChildren = () => assert.fail('refresh must not rebuild an open picker');
  await h.emit({frame: {...frame, world: 'Snake Pit'}, age_ms: 0});
  assert.equal(alpha.textContent, 'Alpha — Snake Pit');assert.equal(beta.textContent, 'Beta — Realm');
  const late = deferred();h.lists.push(late.promise);await h.advance(10000);
  await h.emit({frame: {...frame, world: 'Nexus'}, age_ms: 0});
  const catalogue = bots(['Beta', 'Alpha']);catalogue.bots[0].frame = {...frame, world: 'Vault'};
  late.resolve(json(catalogue));await flush();
  assert.deepEqual(picker.children, [alpha, beta]);assert.equal(alpha.textContent, 'Alpha — Nexus');assert.equal(beta.textContent, 'Beta — Vault');
  assert.equal(picker.value, 'Alpha');assert.equal(alpha.value, 'Alpha');assert.equal(h.window.path, undefined);
  h.choose('Alpha');await flush();
  assert.equal(h.window.path, '?bot=Alpha');assert.equal(h.iframe(), iframe);assert.equal(signal.aborted, false);
  assert.equal(h.calls.filter(call => call.path.endsWith('/stream')).length, 1);
  h.send({}, {data: {type: 'openrotmg-bot-select', bot: 'Alpha', target: 'Beta'}});await flush();
  assert.equal(h.window.path, '?bot=Beta');assert.equal(picker.value, 'Beta');assert.match(h.iframe().src, /\/Beta\/view$/);
});

test('location age, missing worlds, catalogue failures and offline bots are explicit, never guessed', async t => {
  const initial = bots(['Alpha', 'Beta']);initial.bots[0].age_ms = 16000;initial.bots[1].frame = null;
  const h = harness(t, '?bot=Alpha', initial);await flush();
  const picker = h.nodes['#bot'], [alpha, beta] = picker.children, iframe = h.iframe();
  assert.equal(alpha.textContent, 'Alpha — Realm (stale)');assert.equal(beta.textContent, 'Beta — Location unavailable');
  await h.emit({frame, age_ms: 16000});assert.match(h.nodes['#telemetry-status'].textContent, /stale/);
  await h.emit({frame: {...frame, world: '<Vault & "Nexus">'}, age_ms: 0});
  assert.equal(alpha.textContent, 'Alpha — <Vault & "Nexus">');assert.equal(h.nodes['#telemetry-status'].textContent, '');
  h.lists.push(new Response('unavailable', {status: 503}));await h.advance(16000);
  assert.equal(alpha.textContent, 'Alpha — <Vault & "Nexus"> (stale)');assert.match(h.nodes['#status'].textContent, /HTTP 503/);assert.equal(h.iframe(), iframe);
  await h.emit({frame: null, age_ms: 0});assert.equal(alpha.textContent, 'Alpha — Location unavailable');
  await h.emit({frame: {...frame, world: ''}, age_ms: 0});
  assert.equal(alpha.textContent, 'Alpha — Location unavailable');assert.match(h.nodes['#telemetry-status'].textContent, /malformed bot location/);
  const invalid = bots(['Alpha', 'Beta']);invalid.bots[1].frame = {...frame, world: undefined};
  h.lists.push(json(invalid));await h.advance(10000);assert.match(h.nodes['#status'].textContent, /malformed bot location/);
  h.lists.push(json(bots(['Beta'])));await h.advance(10000);
  assert.equal(picker.children[0], alpha);assert.equal(alpha.textContent, 'Alpha — Offline');assert.equal(alpha.disabled, true);
  assert.equal(picker.value, 'Alpha');assert.equal(h.iframe(), undefined);assert.match(h.nodes['#status'].textContent, /Alpha is offline/);
  h.lists.push(json(bots(['Alpha', 'Beta'])));await h.advance(10000);
  assert.equal(picker.children[0], alpha);assert.equal(alpha.disabled, false);assert.equal(alpha.textContent, 'Alpha — Realm');
  assert.notEqual(h.iframe(), iframe);assert.equal(picker.value, 'Alpha');
});

test('perspective-selection messages admit only the current native window and a listed other bot', async t => {
  const source = {}, available = new Set(['Alpha', 'Beta']), data = {type: 'openrotmg-bot-select', bot: 'Alpha', target: 'Beta'};
  const event = {origin: 'https://game.test', source, data};
  assert.equal(selectionMessage(event, event.origin, source, 'Alpha', available), true);
  for (const change of [
    {origin: 'https://evil.test'}, {source: {}}, {data: null}, {data: []},
    ...[{type: 'openrotmg-bot-view'}, {bot: 'old'}, {target: 'Human'}, {target: 'Alpha'}, {target: null}, {status: 'live'}].map(patch => ({data: {...data, ...patch}})),
  ]) assert.equal(selectionMessage({...event, ...change}, event.origin, source, 'Alpha', available), false);
  const h = harness(t);await flush();const old = h.iframe(), signal = h.calls[1].options.signal;
  h.send({}, {data, origin: 'https://evil.test'});assert.equal(h.iframe(), old);
  h.send({}, {data: {...data, target: 'Human'}});assert.equal(h.iframe(), old);
  h.send({}, {data});await flush();
  assert.notEqual(h.iframe(), old);assert.match(h.iframe().src, /Beta\/view$/);assert.equal(h.window.path, '?bot=Beta');assert.equal(signal.aborted, true);
  const next = h.iframe();h.send({}, {data: {...data, bot: 'Beta', target: 'Alpha'}, source: old.contentWindow});assert.equal(h.iframe(), next);
});

test('overview uses plain broad activities, not per-tick targets or internal policy explanations', () => {
  assert.deepEqual(intentionRows(intent).slice(0, 2), [['Trying to', 'Max permanent Speed'], ['Progress', '30 / 50 Speed']]);
  assert.deepEqual(intentionRows(intent).at(-1), ['Recent activity', 'Exploring and fighting']);
  const supply = {...intent, mode: 'necessary', step: 'restocking: returning to remembered loot', reason: 'Restore the carried health reserve from observed supplies', resume: intent.plan};
  assert.deepEqual(intentionRows(supply).at(-1), ['Recent activity', 'Getting health potions']);
  assert(!intentionRows(supply).some(([label]) => ['Why', 'Then', 'Required interruption'].includes(label)));
  for (const [step, summary] of [['surviving: under threat, dodging', 'Staying safe'], ['socializing: following Someone', 'Meeting other players'], ['banking: storing loot', 'Sorting items in the Vault'], ['Return to Nexus before logout', 'Returning to the Nexus to log out']]) assert.equal(intentionRows({...intent, step}).at(-1)[1], summary);
  const uncounted = {...intent, goal: {...intent.goal, current: null, target: null, unit: null}};
  assert(!intentionRows(uncounted).some(([label]) => label === 'Progress'));
  assert.deepEqual(intentionRows({...intent, goal: null})[0], ['Trying to', 'No main goal selected.']);
  assert.throws(() => intentionRows({...intent, step: 'unrecognized: action'}), /unknown bot activity/);
  for (const value of [undefined, {}, {...intent, mode: 'guessed'}, {...intent, reason: ''}, {...intent, private: true},
    ...[{id: 0}, {id: 2**53}, {current: null}, {target: -1}, {unit: undefined}, {account: 2}].map(goal => ({...intent, goal: {...intent.goal, ...goal}})),
  ]) assert.throws(() => intentionRows(value), /missing or malformed|malformed main goal/);
});

test('recent activity changes at most every ten seconds; unchanged descriptions do not rebuild DOM', async t => {
  const h = harness(t);await flush();h.send();
  const visible = () => h.nodes['#intention'].children.flatMap(list => list.children.map(child => child.textContent)).join(' | ');
  await h.emit({frame, age_ms: 0});const first = h.nodes['#intention'].children[0];
  await h.emit({frame: {...frame, intent: {...intent, step: 'adventuring: fighting Easily Enraged Bunny', reason: 'different internal transition'}}, age_ms: 0});
  assert.equal(h.nodes['#intention'].children[0], first);
  const supply = {...frame, intent: {...intent, mode: 'necessary', step: 'restocking: walking to loot', reason: 'Restore the carried health reserve from observed supplies', resume: intent.plan}};
  await h.emit({frame: supply, age_ms: 0});assert.equal(h.nodes['#intention'].children[0], first);
  await h.advance(9999);
  await h.emit({frame: {...supply, intent: {...supply.intent, goal: {...intent.goal, current: 31}}}, age_ms: 0});
  assert.match(visible(), /31 \/ 50 Speed/);assert.match(visible(), /Exploring and fighting/);assert.doesNotMatch(visible(), /Getting health potions|carried health reserve/);
  await h.advance(1);await h.emit({frame: supply, age_ms: 0});assert.match(visible(), /Getting health potions/);
  await h.emit({frame: {...frame, intent: {...intent, step: 'surviving: dodging'}}, age_ms: 0});assert.match(visible(), /Getting health potions/);
  h.send();await h.advance(10000);await h.emit({frame: {...frame, intent: {...intent, step: 'surviving: dodging'}}, age_ms: 0});assert.match(visible(), /Staying safe/);
});

test('world-transfer feed gaps hide unavailable data without bypassing the activity cadence', async t => {
  const h = harness(t);await flush();
  const visible = () => h.nodes['#intention'].children.flatMap(list => list.children.map(child => child.textContent)).join(' | ');
  await h.emit({frame, age_ms: 0});await h.advance(500);
  await h.emit({frame: null, age_ms: 0});assert.equal(visible(), '');assert.match(h.nodes['#intention-status'].textContent, /No decision intention/);
  const supply = {...frame, intent: {...intent, step: 'restocking: returning to remembered loot'}};
  await h.emit({frame: supply, age_ms: 0});assert.match(visible(), /Exploring and fighting/);assert.doesNotMatch(visible(), /Getting health potions/);
  await h.emit({frame: {...frame, intent: undefined}, age_ms: 0});assert.equal(visible(), '');
  await h.emit({frame: supply, age_ms: 0});assert.match(visible(), /Exploring and fighting/);
  await h.advance(9500);await h.emit({frame: supply, age_ms: 0});assert.match(visible(), /Getting health potions/);
});

test('new goals, characters and selection reset immediately; unavailable data never stays visible', async t => {
  const h = harness(t);await flush();h.send();
  const visible = () => h.nodes['#intention'].children.flatMap(list => list.children.map(child => child.textContent)).join(' | ');
  await h.emit({frame, age_ms: 0});
  await h.emit({frame: {...frame, intent: {...intent, goal: {...intent.goal, id: 2}, step: 'restocking: waiting'}}, age_ms: 0});assert.match(visible(), /Getting health potions/);
  await h.emit({frame: {...frame, character: 2, intent: {...intent, goal: {...intent.goal, id: 2}, step: 'trading: waiting'}}, age_ms: 0});assert.match(visible(), /Trading with other players/);
  await h.emit({frame: {...frame, intent: undefined}, age_ms: 0});assert.equal(visible(), '');assert.match(h.nodes['#intention-status'].textContent, /Intentions unavailable/);
  assert.equal(h.nodes['#view-status'].textContent, '');assert.equal(h.nodes['#telemetry-status'].textContent, '');
  await h.emit({frame, age_ms: 0});assert.match(visible(), /Exploring and fighting/);
  await h.emit({frame: null, age_ms: 0});assert.equal(visible(), '');
  await h.emit({frame: {...frame, character: 0}, age_ms: 0});assert.equal(visible(), '');assert.match(h.nodes['#intention-status'].textContent, /invalid character identity/);
  h.choose('Beta');await flush();assert.equal(visible(), '');assert.match(h.nodes['#intention-status'].textContent, /No decision intention/);
});

test('page keeps game and intentions, with fixed layout and exceptional-state announcements only', async () => {
  const html = await readFile(new URL('../public/bots/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../public/bots/style.css', import.meta.url), 'utf8');
  assert.match(html, /frame-src \{\{API_ORIGIN\}\};/);
  for (const id of ['status', 'view-status', 'telemetry-status']) assert.match(html, new RegExp(`id="${id}" role="status"`));
  assert.match(css, /aspect-ratio:4\/3/);assert.match(css, /@media \(max-width:700px\)/);
  assert.match(css, /contain:size/);assert.match(css, /scrollbar-gutter:stable/);assert.match(css, /height:32rem/);
  assert.match(css, /background:#0b0b0b;color:inherit;border:1px solid #303030/);
  assert.doesNotMatch(css, /#151810|#a4bd8a|border-left|#1b2028|#68717e/);
  assert.doesNotMatch(html, /<canvas|id="(?:vitals|thoughts|llm)"|Language model|Thoughts and chat history|Native view:|Selected /);
});
