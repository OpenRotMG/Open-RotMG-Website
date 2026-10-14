export const boards = {
  base_fame: {title: 'Base fame', description: 'Highest base fame on a single character per account, living or dead.'},
  collection: {title: 'Collection', description: 'Unique items personally picked up from enemy drops. Starter gear, trades and player-dropped items do not count.'},
  total_fame: {title: 'Total fame', description: 'Lifetime fame credited from dead characters, before spending. Living characters do not count here.'}
};
export function ranked(players, board) {
  if (!Object.hasOwn(boards, board)) throw new Error('Unknown hiscore category');
  if (!Array.isArray(players)) throw new Error('Malformed hiscores response');
  const seen = new Set();
  for (const p of players) {
    if (!Number.isSafeInteger(p.account) || p.account < 1 || seen.has(p.account) || typeof p.name !== 'string' || !Number.isSafeInteger(p[board]) || p[board] < 0) throw new Error('Malformed hiscores player');
    seen.add(p.account);
  }
  const sorted = [...players].sort((a, b) => b[board] - a[board] || a.account - b.account);
  let rank = 0, previous;
  return sorted.map((player, i) => {if (previous !== player[board]) rank = i + 1; previous = player[board]; return {...player, rank};});
}
async function json(path) {
  const response = await fetch(path, {cache: 'no-store', redirect: 'error'});
  if (!response.ok) throw new Error(`Hiscores request failed (${response.status})`);
  return response.json();
}
async function start() {
  const params = new URLSearchParams(location.search), board = params.get('board') ?? 'base_fame', account = params.get('player');
  if (!Object.hasOwn(boards, board)) throw new Error('Unknown hiscore category');
  const title = document.querySelector('#title'), status = document.querySelector('#status'), search = document.querySelector('#search');
  title.textContent = boards[board].title;document.querySelector('#metric').textContent = boards[board].title;
  document.querySelector('#description').textContent = boards[board].description;
  if (account !== null) {
    if (!/^[1-9]\d*$/.test(account)) throw new Error('Invalid player');
    const [profile, catalog, scores] = await Promise.all([json(`/api/collection/${account}`), json('items.json'), json('/api/hiscores')]);
    if (!Array.isArray(scores.collectible_items) || !Array.isArray(profile.items) || profile.account !== Number(account) || typeof profile.name !== 'string') throw new Error('Malformed collection response');
    const eligible = new Set(scores.collectible_items), found = new Map(profile.items.map(item => [item.item, item.found_at]));
    const items = catalog.filter(item => eligible.has(item.id));
    if (items.length !== eligible.size || [...found.keys()].some(id => !eligible.has(id))) throw new Error('Collection catalogue does not match the server');
    title.textContent = `${profile.name}’s collection`;
    document.querySelector('#scores').hidden = true;document.querySelector('#collection').hidden = false;
    document.querySelector('#description').textContent = boards.collection.description;
    document.querySelector('#collected').textContent = `${found.size} / ${items.length} items obtained`;
    const grid = document.querySelector('#items');
    for (const item of items) {
      const tile = document.createElement('div'), sprite = document.createElement('span'), name = document.createElement('span'), state = document.createElement('span');
      tile.className = 'item';tile.dataset.name = item.name.toLowerCase();name.textContent = item.name;
      sprite.className = found.has(item.id) ? 'sprite' : 'sprite missing';sprite.setAttribute('aria-hidden', 'true');
      sprite.style.backgroundPosition = `${-item.x * 2}px ${-item.y * 2}px`;
      state.textContent = found.has(item.id) ? `Obtained ${new Date(found.get(item.id) * 1000).toLocaleDateString()}` : 'Not obtained';
      tile.append(sprite, name, state);grid.append(tile);
    }
    search.addEventListener('input', () => {for (const tile of grid.children) tile.hidden = !tile.dataset.name.includes(search.value.toLowerCase());});
    status.textContent = 'Black silhouettes are items not yet obtained.';
    return;
  }
  let rows = [];
  const render = () => {
    const body = document.querySelector('tbody');body.replaceChildren();
    for (const player of rows.filter(row => row.name.toLowerCase().includes(search.value.toLowerCase()))) {
      const row = document.createElement('tr'), rank = document.createElement('td'), name = document.createElement('td'), value = document.createElement('td'), link = document.createElement('a');
      rank.textContent = player.rank;link.textContent = player.name;link.href = `?board=collection&player=${player.account}`;name.append(link);value.textContent = player[board].toLocaleString();row.append(rank, name, value);body.append(row);
    }
  };
  search.addEventListener('input', render);
  const refresh = async () => {
    try {
      const scores = await json('/api/hiscores');rows = ranked(scores.players, board);render();
      status.textContent = rows.length ? `Updated ${new Date(scores.updated_at * 1000).toLocaleTimeString()}` : 'No ranked players yet. Sign into a registered game account to enter.';
    } catch (error) {status.textContent = `Update failed: ${error.message}. Previously loaded records may be stale.`;}
  };
  await refresh();setInterval(refresh, 60000);
}
if (typeof document !== 'undefined') start().catch(error => {document.querySelector('#status').textContent = error.message;console.error(error);});
