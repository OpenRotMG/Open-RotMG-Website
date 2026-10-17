import { percentage, validateCatalogue, auditCounts, implementationLabels, historicalLabels } from './catalogue.js';
const $ = id => document.getElementById(id);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const image = url => { const n = el('img', undefined, 'sprite'); n.src = url; n.alt = ''; return n; };
const dialog = $('feature-dialog');
$('feature-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { const r = dialog.getBoundingClientRect(); if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close(); });
const link = source => { const a = el('a', source.label); a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; };
const section = (title, text) => { const n = el('section'); n.append(el('h3', title), el('p', text)); return n; };
const listSection = (title, items) => { const n = el('section'), list = el('ul'); list.append(...items.map(text => el('li', text))); n.append(el('h3', title), list); return n; };
const statuses = f => `Implementation: ${implementationLabels[f.audit.implementation]}. Historical verification: ${historicalLabels[f.audit.historical]}.`;
function sourcesSection(sources, heading = true) {
  const n = el('section'); if (heading) n.append(el('h3', 'Sources'));
  for (const source of sources) { const p = el('p', undefined, 'citation'); p.append(link(source)); n.append(p); }
  return n;
}
function openFeature(f) {
  const a = f.audit;
  $('feature-title').textContent = f.name;
  $('feature-icon').hidden = !f.icon; if (f.icon) $('feature-icon').src = f.icon; else $('feature-icon').removeAttribute('src');
  $('feature-status').textContent = statuses(f);
  const details = [section('Original rules', a.expected)];
  if (a.differences.length) details.push(listSection('Known differences', a.differences));
  if (a.unknowns.length) details.push(listSection('Still unresolved', a.unknowns));
  if (a.sources.length) details.push(sourcesSection(a.sources));
  $('feature-audit').replaceChildren(...details); dialog.showModal();
}
function featureRow(f) {
  const row = el('li'), b = el('button', undefined, 'feature');
  b.dataset.feature = f.id; b.type = 'button'; b.title = `${f.name}. ${statuses(f)}`; b.setAttribute('aria-label', b.title);
  if (f.icon) { const icon = image(f.icon); if (f.category === 'conditions') icon.classList.add('condition-icon'); b.append(icon); }
  const name = el('span', f.name);
  if (f.name === 'Oryx’s Chamber') name.append(el('small', 'Oryx 1'));
  if (f.name === 'Wine Cellar') name.append(el('small', 'Oryx 2'));
  b.append(name); b.addEventListener('click', () => openFeature(f));
  const state = el('span', undefined, 'audit-state');
  state.append(el('span', implementationLabels[f.audit.implementation], `implementation-${f.audit.implementation}`), el('span', historicalLabels[f.audit.historical], `historical-${f.audit.historical}`));
  row.append(b, state); return row;
}
const summary = (counts, labels) => Object.entries(labels).filter(([key]) => counts[key]).map(([key, label]) => `${counts[key]} ${label.toLowerCase()}`).join(' · ');
(async () => {
  try {
    const response = await fetch('progress.json'); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json(); validateCatalogue(data);
    const counts = auditCounts(data.features);
    $('overall').textContent = percentage(data.features);
    $('implementation-summary').textContent = summary(counts.implementation, implementationLabels);
    $('historical-summary').textContent = summary(counts.historical, historicalLabels);
    for (const c of data.categories) {
      const rows = data.features.filter(f => f.category === c.id), area = el('a', c.name); area.href = '#' + c.id; area.dataset.area = c.id;
      const category = el('details', undefined, 'category'); category.id = c.id; category.open = ['heroes', 'access', 'conditions', 'dungeons'].includes(c.id);
      const heading = el('summary', c.name); heading.append(el('span', `(${rows.length})`, 'section-count'));
      const list = el('ul', undefined, 'forum-list'); list.append(...rows.map(featureRow)); category.append(heading, list);
      if (c.unknowns?.length) {
        const questions = el('section', undefined, 'category-questions'), list = el('ul'); questions.append(el('h3', 'Still unresolved'), list);
        for (const item of c.unknowns) { const row = el('li', item.question); if (item.sources.length) row.append(sourcesSection(item.sources, false)); list.append(row); }
        category.append(questions);
      }
      area.addEventListener('click', () => { category.open = true; }); $('areas').append(area); $('features').append(category);
    }
  } catch (error) {
    $('overall').textContent = 'Error'; $('implementation-summary').textContent = 'Unavailable'; $('historical-summary').textContent = 'Unavailable';
    $('error').hidden = false; $('error').textContent = `Cannot load restoration: ${error.message}`; console.error(error);
  }
})();
