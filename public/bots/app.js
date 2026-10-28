// Server-sent events: `data:` lines per message, messages separated by a blank line.
export function events(buffer) {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n'), rest = parts.pop();
  return [parts.flatMap(part => {
    const data = part.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(line.startsWith('data: ') ? 6 : 5)).join('\n');
    return data ? [JSON.parse(data)] : [];
  }), rest];
}

export function viewMessage(event, origin, source, bot, generation) {
  const data = event.data;
  return event.origin === origin && source != null && event.source === source &&
    data !== null && typeof data === 'object' && !Array.isArray(data) &&
    Object.keys(data).every(key => ['type', 'bot', 'status', 'error', ...(generation === undefined ? [] : ['generation'])].includes(key)) &&
    data.type === (generation === undefined ? 'openrotmg-bot-view' : 'openrotmg-bot-state') && data.bot === bot &&
    (generation === undefined || data.generation === generation) &&
    ['connecting', 'live', 'stale', 'disconnected', 'error'].includes(data.status) &&
    (data.error === undefined || typeof data.error === 'string') &&
    (data.status !== 'error' || (typeof data.error === 'string' && data.error.trim().length > 0));
}

export function selectionMessage(event, origin, source, bot, available, generation) {
  const data = event.data;
  return event.origin === origin && source != null && event.source === source &&
    data !== null && typeof data === 'object' && !Array.isArray(data) &&
    Object.keys(data).length === (generation === undefined ? 3 : 6) &&
    Object.keys(data).every(key => ['type', 'bot', 'target', ...(generation === undefined ? [] : ['generation', 'source', 'player'])].includes(key)) &&
    data.type === (generation === undefined ? 'openrotmg-bot-select' : 'openrotmg-bot-choice') && data.bot === bot &&
    (generation === undefined || data.generation === generation &&
      [data.source, data.player].every(value => Number.isInteger(value) && value > 0 && value <= 2147483647) && data.source !== data.player) &&
    typeof data.target === 'string' && data.target !== bot && available.has(data.target) &&
    (generation === undefined || /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(data.target));
}

export function intentionRows(intent) {
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
  if (!intent || typeof intent !== 'object' || Array.isArray(intent) ||
      Object.keys(intent).length !== 6 || !Object.keys(intent).every(key => ['goal', 'plan', 'step', 'mode', 'reason', 'resume'].includes(key)) ||
      !['progress', 'necessary', 'optional'].includes(intent.mode) ||
      !['plan', 'step', 'reason'].every(key => text(intent[key])) ||
      !(intent.resume === null || text(intent.resume))) throw new Error('missing or malformed decision intention');
  const goal = intent.goal;
  if (goal !== null && (!goal || typeof goal !== 'object' || Array.isArray(goal) ||
      Object.keys(goal).length !== 5 || !Object.keys(goal).every(key => ['id', 'label', 'current', 'target', 'unit'].includes(key)) ||
      !Number.isSafeInteger(goal.id) || goal.id <= 0 || !text(goal.label) ||
      !(goal.current === null && goal.target === null && goal.unit === null ||
        Number.isFinite(goal.current) && goal.current >= 0 && Number.isFinite(goal.target) && goal.target > 0 && text(goal.unit)))) throw new Error('malformed main goal');
  // The server prefixes steps with Activity; per-tick targets and reflex details are not useful overview text.
  const activities = {
    busy: 'Finishing an action', surviving: 'Staying safe', trading: 'Trading with other players',
    'sorting gear': 'Sorting equipment', restocking: 'Getting health potions',
    'at an event': 'Taking part in a realm event', 'using items': 'Using a potion',
    socializing: 'Meeting other players', banking: 'Sorting items in the Vault',
    'hanging out in Nexus': 'Spending time in the Nexus',
    'answering a call': 'Responding to another player', adventuring: 'Exploring and fighting',
  };
  const activity = intent.step.split(': ', 1)[0];
  const summary = intent.step === 'Return to Nexus before logout' ? 'Returning to the Nexus to log out'
    : Object.hasOwn(activities, activity) ? activities[activity] : null;
  if (summary === null) throw new Error(`unknown bot activity: ${activity}`);
  return [
    ['Trying to', goal === null ? 'No main goal selected.' : goal.label],
    ...(goal !== null && goal.current !== null ? [['Progress', `${goal.current} / ${goal.target} ${goal.unit}`]] : []),
    ['How', intent.plan],
    ['Recent activity', summary],
  ];
}

function locationSample({frame, age_ms: age}, received) {
  if (!(frame === null || (frame && typeof frame === 'object' && !Array.isArray(frame))) ||
      !(Number.isFinite(age) && age >= 0)) throw new Error('malformed bot telemetry');
  if (frame !== null && (typeof frame.world !== 'string' || !frame.world.trim() || frame.world.length > 512)) throw new Error('missing or malformed bot location');
  return {world: frame?.world ?? null, at: received - age};
}

export function start({document, window, backend, now = Date.now}) {
  const $ = selector => document.querySelector(selector);
  const origin = backend.url('/api/bots').origin;
  let selected = new URLSearchParams(window.location.search).get('bot'), active, bridge, refreshId = 0, available = new Set();
  const options = new Map();
  const current = session => active === session && !session.controller.signal.aborted;
  function label(entry) {
    const location = !entry.online ? 'Offline' : entry.world === null ? 'Location unavailable'
      : `${entry.world}${now() - entry.at > 15000 ? ' (stale)' : ''}`;
    const text = `${entry.option.value} — ${location}`;
    if (entry.option.textContent !== text) entry.option.textContent = text;
  }
  function locate(entry, sample) {
    if (entry.at === undefined || sample.at >= entry.at) Object.assign(entry, sample);
    label(entry);
  }
  function nativeStatus(session, status, error) {
    session.native = status;session.nativeAt = now();
    $('#view-status').textContent = status === 'live' ? '' : status === 'connecting' ? 'Loading game view…' : `Game view ${status}${error ? `: ${error}` : '.'}`;
  }
  function telemetryStatus(session) {
    const elapsed = session.received === undefined ? 0 : now() - session.received;
    const state = session.telemetry === 'receiving' && elapsed > 5000 ? 'stale' : session.telemetry;
    $('#telemetry-status').textContent = ['receiving', 'connecting'].includes(state) ? '' : `Intentions ${state}.`;
  }
  function stop() {
    active?.controller.abort();active = undefined;
    $('#intention').replaceChildren();$('#intention-status').textContent = 'No decision intention received.';
    $('#view-status').textContent = '';
    $('#telemetry-status').textContent = '';
  }
  function show(session, update) {
    const {frame} = update, entry = options.get(session.name);
    let sample;
    try {sample = locationSample(update, now());}
    catch (error) {
      Object.assign(entry, {world: null, at: now()});label(entry);throw error;
    }
    locate(entry, sample);
    session.received = sample.at;session.telemetry = 'receiving';
    if (frame === null) {
      // World handoffs briefly clear the feed, but must not restart the overview's sampling window.
      session.rendered = undefined;
      $('#intention').replaceChildren();$('#intention-status').textContent = 'No decision intention received.';
    } else {
      try {
        if (!Number.isSafeInteger(frame.character) || frame.character <= 0) throw new Error('invalid character identity');
        const rows = intentionRows(frame.intent), identity = `${frame.character}:${frame.intent.goal?.id}`;
        const activity = rows.at(-1);
        // This is a recent overview, not a per-decision debug readout; goal progress still updates immediately.
        if (session.activity?.identity !== identity || now() - session.activity.at >= 10000) {
          session.activity = {identity, at: now(), text: activity[1]};
        }
        activity[1] = session.activity.text;
        const rendered = JSON.stringify([identity, rows]);
        if (session.rendered !== rendered) {
          const list = document.createElement('dl');
          list.setAttribute('data-intention-id', identity);
          list.setAttribute('data-activity-at', session.activity.at);
          list.replaceChildren(...rows.flatMap(([label, value]) => {
            const term = document.createElement('dt'), description = document.createElement('dd');
            term.textContent = label;description.textContent = value;return [term, description];
          }));
          $('#intention').replaceChildren(list);session.rendered = rendered;
        }
        $('#intention-status').textContent = '';
      } catch (error) {
        session.rendered = undefined;$('#intention').replaceChildren();
        $('#intention-status').textContent = `Intentions unavailable: ${error.message}.`;console.error(error);
      }
    }
    telemetryStatus(session);
  }
  async function watch(session) {
    while (current(session)) {
      let reader;
      try {
        session.telemetry = 'connecting';telemetryStatus(session);
        const response = await backend.fetch(`/api/bots/${encodeURIComponent(session.name)}/stream`, {cache: 'no-store', redirect: 'error', signal: session.controller.signal});
        if (!current(session)) return;
        if (!response.ok) throw new Error(`stream refused (HTTP ${response.status}): ${await response.text()}`);
        if (!response.body) throw new Error('stream response has no body');
        reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        while (current(session)) {
          const {value, done} = await reader.read();
          if (!current(session)) return;
          if (done) throw new Error('the server closed the stream');
          let updates;[updates, buffer] = events(buffer + value);
          for (const update of updates) show(session, update);
        }
      } catch (error) {
        if (!current(session)) return;
        session.telemetry = `unavailable: ${error.message}. Reconnecting in 5 s`;telemetryStatus(session);console.error(error);
      } finally {
        if (reader) await reader.cancel().catch(error => {if (current(session)) console.error(error);});
      }
      if (!current(session)) return;
      await new Promise(resolve => {
        const finish = () => {window.clearTimeout(timer);session.controller.signal.removeEventListener('abort', finish);resolve();};
        const timer = window.setTimeout(finish, 5000);
        session.controller.signal.addEventListener('abort', finish, {once: true});
      });
    }
  }
  function requestView() {
    if (bridge.failed) {
      if (active) nativeStatus(active, 'error', 'Native viewer is closed; reload CCTV to reopen it');
      return;
    }
    if (!bridge.ready || bridge.pending || bridge.name === selected || !available.has(selected)) return;
    bridge.pending = {bot: selected, generation: bridge.generation + 1};
    bridge.iframe.contentWindow.postMessage({type: 'openrotmg-bot-watch', ...bridge.pending, target: bridge.target}, origin);
  }
  function select(name, target = {kind: 'bot', bot: name}) {
    stop();
    const session = active = {name, controller: new AbortController(), telemetry: 'connecting'};
    if (!bridge) {
      const iframe = document.createElement('iframe');
      iframe.title = `Read-only native gameplay for ${name}`;
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      iframe.setAttribute('allow', "autoplay 'none'; camera 'none'; microphone 'none'; fullscreen 'none'; gamepad 'none'");
      iframe.referrerPolicy = 'no-referrer';
      iframe.src = backend.url(`/api/bots/${encodeURIComponent(name)}/view`).href;
      iframe.addEventListener('error', () => {if (active) {bridge.failed = true;nativeStatus(active, 'error', 'native page failed to load');}});
      bridge = {iframe, initial: name, name, generation: 0, ready: false};
      $('#view').replaceChildren(iframe);
    }
    bridge.target = target;session.iframe = bridge.iframe;
    nativeStatus(session, 'connecting');telemetryStatus(session);requestView();void watch(session);
  }
  function message(event) {
    if (!bridge || event.origin !== origin || event.source !== bridge.iframe.contentWindow) return;
    const data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data) || bridge.failed && data.status !== 'error') return;
    const shape = keys => Object.keys(data).sort().join(',') === keys;
    if (data.type === 'openrotmg-bot-ready' && shape('bot,generation,type') && !bridge.ready && data.bot === bridge.initial && data.generation === 0) {
      bridge.ready = true;requestView();return;
    }
    if (data.type === 'openrotmg-bot-selected' && shape('bot,generation,type') && bridge.pending &&
        data.bot === bridge.pending.bot && data.generation === bridge.pending.generation) {
      bridge.name = data.bot;bridge.generation = data.generation;bridge.pending = null;
      bridge.iframe.title = `Read-only native gameplay for ${data.bot}`;requestView();return;
    }
    if (data.type === 'openrotmg-bot-rejected' && shape('bot,error,generation,requested,type') && bridge.pending &&
        data.bot === bridge.name && data.generation === bridge.generation && data.requested === bridge.pending.generation &&
        typeof data.error === 'string' && data.error.trim()) {
      const attempted = bridge.pending.bot;bridge.pending = null;
      if (selected === attempted) {
        $('#bot').value = bridge.name;change({target: $('#bot')});
        $('#status').textContent = `Cannot watch ${attempted}: ${data.error}. Current view: ${bridge.name}.`;
      } else requestView();
      return;
    }
    if (data.status === 'error' && viewMessage(event, origin, bridge.iframe.contentWindow, bridge.name, bridge.ready ? bridge.generation : undefined)) {
      bridge.failed = true;bridge.pending = null;
      if (active) nativeStatus(active, 'error', data.error);
      return;
    }
    if (!active || bridge.failed) return;
    if (bridge.ready && !bridge.pending && active.name === bridge.name &&
        selectionMessage(event, origin, bridge.iframe.contentWindow, active.name, new Set([...available, data.target]), bridge.generation)) {
      const pick = () => {
        $('#bot').value = data.target;
        change({target: $('#bot')}, {kind: 'player', source: data.source, target: data.player});
      };
      if (available.has(data.target)) pick();
      else {
        const from = active, generation = bridge.generation;
        void refresh().then(refreshed => {
          if (!refreshed || active !== from || bridge.generation !== generation || bridge.pending) return;
          if (available.has(data.target)) pick();
          else $('#status').textContent = `Bot ${data.target} is no longer available.`;
        });
      }
      return;
    }
    if ((!bridge.ready || !bridge.pending && active.name === bridge.name) &&
        viewMessage(event, origin, bridge.iframe.contentWindow, active.name, bridge.ready ? bridge.generation : undefined)) nativeStatus(active, data.status, data.error);
  }
  async function refresh() {
    const id = ++refreshId, requested = now();
    try {
      const response = await backend.fetch('/api/bots', {cache: 'no-store', redirect: 'error'});
      if (id !== refreshId) return false;
      if (!response.ok) throw new Error(`bot list failed (HTTP ${response.status}): ${await response.text()}`);
      const list = await response.json();
      if (id !== refreshId) return false;
      if (!Array.isArray(list.bots) || !list.bots.every(bot => bot && typeof bot.name === 'string' && bot.name.length)) throw new Error('malformed bot list');
      const names = new Set(list.bots.map(bot => bot.name));
      if (names.size !== list.bots.length) throw new Error('duplicate bot identities in live list');
      const catalogue = list.bots.map(bot => ({name: bot.name, ...locationSample(bot, requested)}));
      available = names;
      const picker = $('#bot');
      selected ??= list.bots[0]?.name;
      for (const bot of catalogue) {
        if (!options.has(bot.name)) {
          const option = document.createElement('option');option.value = bot.name;
          options.set(bot.name, {option, world: null});picker.appendChild(option);
        }
      }
      for (const [name, entry] of options) {
        if (!available.has(name) && name !== selected && name !== bridge?.name) {
          picker.removeChild(entry.option);options.delete(name);continue;
        }
        entry.online = available.has(name);entry.option.disabled = !entry.online;label(entry);
      }
      for (const bot of catalogue) {
        // A catalogue request started before the current SSE cannot roll back a world handoff.
        if (active?.name === bot.name && active.received !== undefined && active.received >= requested) continue;
        locate(options.get(bot.name), bot);
      }
      if (picker.value !== selected) picker.value = selected ?? '';
      picker.disabled = !list.bots.length;
      if (!list.bots.some(bot => bot.name === selected)) {
        stop();$('#status').textContent = selected ? `Bot ${selected} is offline or unavailable. Pick another bot.` : 'No bots are running on this server.';return true;
      }
      $('#status').textContent = '';
      if (active?.name !== selected) select(selected);
      return true;
    } catch (error) {
      if (id !== refreshId) return false;
      $('#status').textContent = `Bot list error: ${error.message}. Retrying in 10 s.`;console.error(error);
      return false;
    }
  }
  function change(event, target) {
    selected = event.target.value;
    window.history.replaceState(null, '', `?bot=${encodeURIComponent(selected)}`);
    $('#status').textContent = '';if (active?.name !== selected) select(selected, target);
  }
  $('#bot').addEventListener('change', change);window.addEventListener('message', message);
  const tick = window.setInterval(() => {
    for (const entry of options.values()) label(entry);
    if (!active) return;
    telemetryStatus(active);
    if (['live', 'connecting'].includes(active.native) && now() - active.nativeAt > 15000) nativeStatus(active, active.native === 'live' ? 'stale' : 'error', 'no native status received for 15 s');
  }, 1000);
  const polling = window.setInterval(() => {void refresh();}, 10000);
  void refresh();
  return () => {++refreshId;stop();$('#view').replaceChildren();bridge = undefined;window.clearInterval(tick);window.clearInterval(polling);window.removeEventListener('message', message);$('#bot').removeEventListener('change', change);};
}

if (typeof document !== 'undefined') start({document, window, backend: window.OpenRotMGBackend});
