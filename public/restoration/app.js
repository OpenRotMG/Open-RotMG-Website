import { percentage, validateCatalogue, auditCounts, implementationLabels, historicalLabels } from './catalogue.js';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const image = url => { const n = el('img', undefined, 'sprite'); n.src = url; n.alt = ''; return n; };
const dialog = $('feature-dialog');
$('feature-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); });
const link = url => { const a = el('a', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
const section = (title, text) => { const n = el('section'); n.append(el('h3', title), el('p', text)); return n; };
const listSection = (title, items) => { const n = el('section'), list = el('ul'); list.append(...items.map(text => el('li', text))); n.append(el('h3', title), list); return n; };
const statuses = f => `Implementation: ${implementationLabels[f.audit.implementation]}. Historical verification: ${historicalLabels[f.audit.historical]}.`;
function openFeature(f) {
  const a = f.audit;
  $('feature-title').textContent = f.name;
  $('feature-icon').hidden = !f.icon; if (f.icon) $('feature-icon').src = f.icon; else $('feature-icon').removeAttribute('src');
  $('feature-status').textContent = statuses(f);
  $('feature-gates').replaceChildren(...['Original rules', 'Recreation'].map((name, i) => {
    const row = el('div', undefined, 'gate'); row.dataset.verified = String(f.stage > i);
    row.append(el('span', name), el('strong', f.stage > i ? 'Verified' : 'Not verified', f.stage > i ? 'passed' : '')); return row;
  }));
  const details = [section('Original rules and scope', a.expected), section('Implementation at this snapshot', a.observed), section('Research-stage verification notes', a.verification)];
  if (a.differences.length) details.push(listSection('Recorded gaps and differences', a.differences));
  if (a.unknowns.length) details.push(listSection('Still unresolved', a.unknowns));
  const citations = el('section'); citations.append(el('h3', 'Sources'));
  for (const source of a.sources) { const p = el('p', undefined, 'citation'); p.append(el('strong', `${source.kind}: `), link(source.url), el('span', source.passage)); citations.append(p); }
  if (!a.sources.length) citations.append(el('p', 'No sources accepted for this entry yet.'));
  details.push(citations); $('feature-audit').replaceChildren(...details); dialog.showModal();
}
function featureRow(f) {
  const row = el('li'), b = el('button', undefined, 'feature');
  b.dataset.feature = f.id; b.type = 'button'; b.title = `${f.name}. ${statuses(f)} ${f.stage}/2 verified gates.`; b.setAttribute('aria-label', b.title);
  if (f.icon) { const icon = image(f.icon); if (f.category === 'conditions') icon.classList.add('condition-icon'); b.append(icon); }
  const name = el('span', f.name);
  if (f.name === 'Oryx’s Chamber') name.append(el('small', 'Oryx 1'));
  if (f.name === 'Wine Cellar') name.append(el('small', 'Oryx 2'));
  b.append(name); b.addEventListener('click', () => openFeature(f));
  const state = el('span', undefined, 'audit-state');
  state.append(el('span', implementationLabels[f.audit.implementation], `implementation-${f.audit.implementation}`), el('span', historicalLabels[f.audit.historical], `historical-${f.audit.historical}`));
  row.append(b, state, el('span', `${f.stage}/2`, 'gate-count')); return row;
}
(async () => {
  try {
    const response = await fetch('progress.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(), { n } = validateCatalogue(data), counts = auditCounts(data.features);
    $('overall').textContent = percentage(data.features);
    $('overall').setAttribute('aria-label', `${percentage(data.features)} provisional evidence score across ${n} feature bundles; open source data`);
    $('implementation-summary').textContent = Object.entries(implementationLabels).map(([key, label]) => `${counts.implementation[key]} ${label.toLowerCase()}`).join(' · ');
    $('historical-summary').textContent = Object.entries(historicalLabels).map(([key, label]) => `${counts.historical[key]} ${label.toLowerCase()}`).join(' · ');
    const audit = data.scope.audit;
    $('source-reference').href = `https://github.com/OpenRotMG/Open-RotMG-Server/blob/${audit.server}/docs/reference-sources.md`;
    $('audit-date').textContent = `Checked ${audit.date}. Snapshot: server ${audit.server.slice(0, 7)}, client ${audit.client.slice(0, 7)}. Older evidence is identified in each entry.`;
    $('audit-verification').textContent = audit.verification;
    for (const c of data.categories) {
      const rows = data.features.filter(f => f.category === c.id), area = el('a', c.name); area.href = '#' + c.id; area.dataset.area = c.id;
      const category = el('details', undefined, 'category'); category.id = c.id; category.open = ['heroes', 'access', 'conditions', 'dungeons'].includes(c.id);
      const summary = el('summary', c.name); summary.append(el('span', `(${rows.length})`, 'section-count'));
      const list = el('ul', undefined, 'forum-list'); list.append(...rows.map(featureRow)); category.append(summary, list);
      area.addEventListener('click', () => { category.open = true; }); $('areas').append(area); $('features').append(category);
    }
    for (const item of data.scope.dispositions) {
      const entry = el('li'); entry.append(el('strong', `${item.name}: ${item.disposition}. `), el('span', item.reason));
      for (const id of item.covered_by) { const f = data.features.find(f => f.id === id), b = el('button', f.name, 'feature'); b.type = 'button'; b.addEventListener('click', () => openFeature(f)); entry.append(el('br'), b); }
      for (const source of item.sources) entry.append(el('br'), link(source.url));
      $('scope-dispositions').append(entry);
    }
  } catch (error) {
    $('overall').textContent = 'Error'; $('implementation-summary').textContent = 'Audit unavailable'; $('historical-summary').textContent = 'Audit unavailable';
    $('error').hidden = false; $('error').textContent = `Cannot load restoration: ${error.message}`; console.error(error);
  }
})();
