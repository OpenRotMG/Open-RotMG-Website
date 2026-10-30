const STATUS = {
  'gap': 'Gap',
  'needs-measurement': 'Needs measurement',
  'needs-footage': 'Needs 2012 footage',
  'ok': 'Matches 2012',
};
const ICONS = '../restoration/assets/player/';
const $ = selector => document.querySelector(selector);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

// Claims carry Markdown-style links; build them as nodes so no claim text is parsed as HTML.
function rich(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`/g)) {
    nodes.push(text.slice(last, match.index));
    if (match[3]) nodes.push(el('code', {textContent: match[3]}));
    else if (match[2].startsWith('#area-')) nodes.push(el('a', {href: match[2], textContent: match[1]}));
    else nodes.push(el('a', {href: match[2], textContent: match[1], target: '_blank', rel: 'noopener'}));
    last = match.index + match[0].length;
  }
  nodes.push(text.slice(last));
  return nodes;
}

function counts(claims) {
  const total = Object.fromEntries(Object.keys(STATUS).map(key => [key, 0]));
  for (const claim of claims) total[claim.status] += 1;
  return total;
}

export function validate(data) {
  const ids = new Set();
  if (!Array.isArray(data?.areas) || !Array.isArray(data.focus)) throw new Error('malformed scorecard');
  for (const area of data.areas) {
    if (typeof area.id !== 'string' || typeof area.name !== 'string' || !['place', 'situation'].includes(area.kind) || !Array.isArray(area.claims)) throw new Error(`malformed area ${area.id}`);
    for (const claim of area.claims) {
      if (ids.has(claim.id) || !Object.hasOwn(STATUS, claim.status) || typeof claim.text !== 'string') throw new Error(`malformed claim ${claim.id}`);
      ids.add(claim.id);
    }
  }
  for (const focus of data.focus) if (!ids.has(focus.claim)) throw new Error(`focus names unknown claim ${focus.claim}`);
  return data;
}

function card(area, open) {
  const total = counts(area.claims);
  const node = el('article', {className: 'roadmap-area', id: `area-${area.id}`},
    el('h3', {}, el('img', {className: 'sprite', src: ICONS + area.icon, alt: ''}), area.name),
    el('p', {textContent: `${area.kind === 'place' ? 'Place' : 'Situation'} · ${area.summary}`}));
  if (!area.drafted) {
    node.append(el('p', {className: 'not-drafted', textContent: 'Not written yet: no claims or measurements.'}));
    return node;
  }
  node.append(el('p', {className: 'area-counts', textContent: Object.entries(STATUS).map(([key, label]) => `${label}: ${total[key]}`).join(' · ')}));
  const gaps = area.claims.filter(claim => claim.status === 'gap');
  if (gaps.length) {
    node.append(el('section', {}, el('h3', {textContent: 'Biggest gaps'}),
      el('ul', {}, ...gaps.map(claim => el('li', {}, el('button', {className: 'check', type: 'button', onclick: () => open(claim, area)}, ...rich(claim.text)))))));
  }
  const footage = area.claims.filter(claim => claim.status === 'needs-footage');
  if (footage.length) {
    node.append(el('details', {className: 'research-preview'}, el('summary', {textContent: 'Missing 2012 footage'}),
      el('ul', {}, ...footage.map(claim => el('li', {}, ...rich(claim.text))))));
  }
  if (area.measured) node.append(el('p', {className: 'work-note', textContent: `Bots measured on ${area.measured}.`}));
  return node;
}

function row(claim, area, open) {
  return el('li', {},
    el('div', {}, el('button', {className: 'feature', type: 'button', onclick: () => open(claim, area)},
      el('img', {className: 'sprite', src: ICONS + area.icon, alt: ''}),
      el('span', {}, ...rich(claim.text), el('small', {textContent: `${area.name} · ${claim.section}`})))),
    el('div', {className: `audit-state status-${claim.status}`, textContent: STATUS[claim.status]}));
}

export async function start() {
  const response = await fetch('scorecard.json', {cache: 'no-store'});
  if (!response.ok) throw new Error(`scorecard ${response.status}`);
  const data = validate(await response.json());
  const byId = new Map(data.areas.flatMap(area => area.claims.map(claim => [claim.id, [claim, area]])));
  const dialog = $('#claim-dialog');
  const open = (claim, area) => {
    $('#claim-icon').src = ICONS + area.icon;
    $('#claim-title').textContent = claim.focus ? `Focus #${claim.focus} · ${area.name}` : area.name;
    $('#claim-body').replaceChildren(
      el('p', {}, el('strong', {}, ...rich(claim.text))),
      el('p', {className: `status-${claim.status}`, textContent: `${STATUS[claim.status]} · ${claim.section}`}),
      el('h3', {textContent: '2012 evidence'}), el('p', {}, ...rich(claim.evidence)),
      el('h3', {textContent: 'Bots now'}), el('p', {}, ...rich(claim.now)),
      ...(area.measured ? [el('p', {className: 'work-note', textContent: `Measured on ${area.measured}.`})] : []));
    dialog.showModal();
  };
  $('#feature-close').onclick = () => dialog.close();
  $('#focus').replaceChildren(...data.focus.map(({claim: id}) => {
    const [claim, area] = byId.get(id);
    return el('li', {}, el('button', {className: 'check', type: 'button', onclick: () => open(claim, area)}, ...rich(claim.text)),
      el('div', {className: `status-${claim.status}`, textContent: `${STATUS[claim.status]} · ${area.name}`}));
  }));
  $('#roadmap').replaceChildren(...data.areas.map(area => card(area, open)));
  for (const area of data.areas.filter(area => area.drafted)) $('#area').append(el('option', {value: area.id, textContent: area.name}));
  for (const [key, label] of Object.entries(STATUS)) $('#status').append(el('option', {value: key, textContent: label}));
  const render = () => {
    const query = $('#search').value.trim().toLowerCase();
    const shown = data.areas.filter(area => !$('#area').value || area.id === $('#area').value)
      .flatMap(area => area.claims.filter(claim => (!$('#status').value || claim.status === $('#status').value)
        && (!query || `${claim.text} ${claim.evidence} ${claim.now} ${area.name}`.toLowerCase().includes(query))).map(claim => row(claim, area, open)));
    $('#visible-count').textContent = `${shown.length} of ${byId.size} claims`;
    $('#list').replaceChildren(el('ul', {className: 'forum-list'}, ...shown));
  };
  for (const id of ['#search', '#area', '#status']) $(id).addEventListener('input', render);
  $('#clear').onclick = () => { $('#search').value = $('#area').value = $('#status').value = ''; render(); };
  $('#filters').disabled = false;
  render();
}

if (typeof document !== 'undefined' && document.querySelector('#claims')) {
  start().catch(error => {
    $('#error').hidden = false;
    $('#error').textContent = `Could not load the bot scorecard: ${error.message}`;
    console.error(error);
  });
}
