const palette = [[/water/i, '#1f4f8f'], [/lava/i, '#a33a12'], [/sand|beach/i, '#b8a46a'], [/grass|jungle|moss/i, '#3f7a32'], [/snow|ice/i, '#d8e4ec'], [/wood|plank/i, '#7a5a32'], [/dirt|mud|brown/i, '#6b4f30']];
export const groundColor = name => palette.find(([pattern]) => pattern.test(name))?.[1] ?? '#5c5c5c';
// Server-sent events: `data:` lines per message, messages separated by a blank line.
export function events(buffer) {
  const parts = buffer.split('\n\n'), rest = parts.pop();
  return [parts.flatMap(part => {
    const data = part.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(line.startsWith('data: ') ? 6 : 5)).join('\n');
    return data ? [JSON.parse(data)] : [];
  }), rest];
}
const $ = selector => document.querySelector(selector);
let grounds = {}, watching;

function draw({frame, sight}) {
  const canvas = $('#view'), g = canvas.getContext('2d'), px = canvas.width / sight.size;
  const at = (x, y) => [(x - sight.x) * px, (y - sight.y) * px];
  g.fillStyle = '#000';g.fillRect(0, 0, canvas.width, canvas.height);
  sight.ground.forEach((ground, i) => {
    if (ground < 0) return;
    if (!(ground in grounds)) throw new Error(`Unknown ground type ${ground}`);
    g.fillStyle = groundColor(grounds[ground]);g.fillRect(i % sight.size * px, Math.floor(i / sight.size) * px, px, px);
  });
  const dot = (x, y, radius, color) => {g.fillStyle = color;g.beginPath();g.arc(...at(x, y), radius, 0, 2 * Math.PI);g.fill();};
  g.font = '11px Verdana';g.textAlign = 'center';
  for (const o of sight.objects) {
    const color = o.enemy ? '#ff4040' : o.class === 'Player' ? '#40e0ff' : o.class === 'Container' ? '#c08040' : o.class === 'Portal' ? '#c060ff' : o.blocks ? '#202020' : '#a0a0a0';
    dot(o.x, o.y, o.enemy || o.class === 'Player' ? 5 : 3, color);
    if (o.enemy || o.class === 'Player' || o.class === 'Portal') {g.fillStyle = color;g.fillText(o.level ? `${o.name} (${o.level})` : o.name, at(o.x, o.y)[0], at(o.x, o.y)[1] - 8);}
  }
  for (const p of sight.projectiles) dot(p.x, p.y, 2, p.own ? '#ffff60' : '#ff9030');
  const [x, y] = at(frame.x, frame.y);
  if (frame.target) {
    g.strokeStyle = '#60ff60';g.setLineDash([4, 4]);g.beginPath();g.moveTo(x, y);g.lineTo(...at(...frame.target));g.stroke();
    dot(...frame.target, 3, '#60ff60');
  }
  if (frame.aim !== null) {
    g.strokeStyle = '#ffff60';g.setLineDash(frame.fired ? [] : [2, 4]);g.beginPath();g.moveTo(x, y);
    g.lineTo(x + Math.cos(frame.aim) * 8 * px, y + Math.sin(frame.aim) * 8 * px);g.stroke();
  }
  g.setLineDash([]);dot(frame.x, frame.y, 6, '#fff');
}

function show(name, update) {
  const {frame, age_ms: age} = update;
  if (frame === null) {$('#vitals').textContent = `${name} has not made a decision since the server started.`;return;}
  const stale = age > 5000 ? ` Last decision ${Math.round(age / 1000)} s ago: busy, dead or changing worlds.` : '';
  $('#vitals').textContent = `${name}, level ${frame.level} ${frame.class} in ${frame.world}. HP ${frame.hp}/${frame.max_hp}, MP ${frame.mp}/${frame.max_mp}. ${frame.reason[0].toUpperCase()}${frame.reason.slice(1)}.${frame.aim === null ? '' : frame.fired ? ' Shooting.' : ' Aiming.'}${stale}`;
  if (update.sight !== null) draw(update);
  const list = $('#thoughts');
  for (const thought of update.thoughts) {
    const item = document.createElement('li');
    item.textContent = `${new Date(thought.at).toLocaleTimeString()} ${thought.text}`;list.prepend(item);
  }
  while (list.children.length > 50) list.lastChild.remove();
}

async function watch(name, signal) {
  const response = await OpenRotMGBackend.fetch(`/api/bots/${encodeURIComponent(name)}/stream`, {cache: 'no-store', redirect: 'error', signal});
  if (!response.ok) throw new Error(`stream refused (HTTP ${response.status}): ${await response.text()}`);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const {value, done} = await reader.read();
    if (done) throw new Error('the server closed the stream');
    let updates;[updates, buffer] = events(buffer + value);
    for (const update of updates) show(name, update);
    $('#status').textContent = `Watching ${name} live.`;
  }
}

async function select(name) {
  watching?.abort();
  const controller = watching = new AbortController();
  $('#thoughts').replaceChildren();
  while (!controller.signal.aborted) {
    try {await watch(name, controller.signal);} catch (error) {
      if (controller.signal.aborted) return;
      $('#status').textContent = `Stream error: ${error.message}. Retrying in 5 s.`;console.error(error);
      // Reconnecting replays the server's thought buffer, so start from empty.
      await new Promise(resolve => setTimeout(resolve, 5000));$('#thoughts').replaceChildren();
    }
  }
}

function llm(status) {
  if (!status.enabled) return 'Disabled on this server.';
  return `${status.model}: ${status.status}. Today ${status.daily_requests} of ${status.daily_limit} requests (${status.automatic_remaining} left for bot-initiated speech), ${status.successes} succeeded, ${status.failures} failed, ${status.in_flight} in flight.` +
    (status.last_latency_ms === null ? '' : ` Last reply took ${status.last_latency_ms} ms.`) + (status.last_error ? ` Last error: ${status.last_error}.` : '');
}

async function refresh() {
  const response = await OpenRotMGBackend.fetch('/api/bots', {cache: 'no-store', redirect: 'error'});
  if (!response.ok) throw new Error(`bot list failed (HTTP ${response.status}): ${await response.text()}`);
  const list = await response.json();
  if (!Array.isArray(list.bots) || typeof list.grounds !== 'object' || typeof list.llm !== 'object') throw new Error('malformed bot list');
  grounds = list.grounds;$('#llm').textContent = llm(list.llm);
  const picker = $('#bot'), chosen = picker.value || new URLSearchParams(location.search).get('bot') || list.bots[0]?.name;
  picker.replaceChildren(...list.bots.map(bot => new Option(bot.frame ? `${bot.name} (level ${bot.frame.level} ${bot.frame.class}, ${bot.frame.reason})` : bot.name, bot.name)));
  if (!list.bots.length) {$('#status').textContent = 'No bots are running on this server.';return;}
  picker.value = chosen;
  if (picker.value !== chosen) throw new Error(`no live bot named ${chosen}`);
  if (!watching) void select(chosen);
}

if (typeof document !== 'undefined') {
  $('#bot').addEventListener('change', event => {history.replaceState(null, '', `?bot=${encodeURIComponent(event.target.value)}`);void select(event.target.value);});
  const update = () => refresh().catch(error => {$('#status').textContent = `Bot list error: ${error.message}`;console.error(error);});
  void update();setInterval(update, 10000);
}
