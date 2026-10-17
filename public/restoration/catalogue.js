export const implementationLabels = { present: 'Present', partial: 'Partial', missing: 'Missing', 'not-audited': 'Not audited' };
export const historicalLabels = { verified: 'Verified', partial: 'Partially verified', 'known-differences': 'Known differences', unreviewed: 'Unreviewed' };
export const percentage = rows => (100 * rows.reduce((sum, f) => sum + f.stage, 0) / (2 * rows.length)).toFixed(1).replace(/\.0$/, '') + '%';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const stringList = value => Array.isArray(value) && value.every(nonempty);

export function validateSources(sources, id) {
  if (!Array.isArray(sources)) throw new Error(`Invalid sources: ${id}`);
  for (const source of sources) {
    if (!source || !nonempty(source.url) || !nonempty(source.passage) || !['historical', 'implementation', 'verification'].includes(source.kind)) throw new Error(`Invalid citation: ${id}`);
    let url;
    try { url = new URL(source.url); } catch { throw new Error(`Invalid citation URL: ${id}`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Unsafe citation URL: ${id}`);
    if ([...url.searchParams.keys()].some(key => /token|password|secret|credential|signature|api[_-]?key|authorization/i.test(key))) throw new Error(`Sensitive citation URL: ${id}`);
    const parts = url.pathname.split('/');
    if ((url.hostname === 'github.com' && ['blob', 'tree'].includes(parts[3]) && !/^[a-f0-9]{40}$/.test(parts[4])) || (url.hostname === 'raw.githubusercontent.com' && !/^[a-f0-9]{40}$/.test(parts[3]))) throw new Error(`Unpinned GitHub citation: ${id}`);
  }
}

export function auditCounts(features) {
  const implementation = Object.fromEntries(Object.keys(implementationLabels).map(key => [key, 0]));
  const historical = Object.fromEntries(Object.keys(historicalLabels).map(key => [key, 0]));
  for (const f of features) {
    if (!f.audit || !Object.hasOwn(implementation, f.audit.implementation) || !Object.hasOwn(historical, f.audit.historical)) throw new Error(`Invalid audit status: ${f.id}`);
    implementation[f.audit.implementation]++;
    historical[f.audit.historical]++;
  }
  return { implementation, historical };
}

export function validateCatalogue(data) {
  if (!data?.scope || !Array.isArray(data.features) || !Array.isArray(data.categories) || !data.features.length || !data.categories.length) throw new Error('Invalid catalogue');
  const { features, categories, scope } = data;
  if (!scope.audit || !/^\d{4}-\d{2}-\d{2}$/.test(scope.audit.date) || !['server', 'client', 'baseline_website'].every(key => /^[a-f0-9]{40}$/.test(scope.audit[key]))) throw new Error('Invalid audit snapshot');
  if (!nonempty(scope.audit.verification)) throw new Error('Missing audit verification basis');
  if (scope.target !== '123.5.1') throw new Error('Unexpected restoration target');
  if (features.some(f => !f || !nonempty(f.id)) || categories.some(c => !c || !nonempty(c.id))) throw new Error('Invalid catalogue entry');
  if (new Set(features.map(f => f.id)).size !== features.length || new Set(categories.map(c => c.id)).size !== categories.length) throw new Error('Duplicate catalogue identifiers');
  for (const c of categories) {
    if (!nonempty(c.id) || !nonempty(c.name) || typeof c.icon !== 'string') throw new Error(`Invalid category: ${c.id}`);
    if (!features.some(f => f.category === c.id)) throw new Error(`Empty category: ${c.id}`);
  }
  auditCounts(features);
  for (const f of features) {
    if (!nonempty(f.id) || !nonempty(f.name) || ![0, 1, 2].includes(f.stage) || !categories.some(c => c.id === f.category) || (f.icon !== null && typeof f.icon !== 'string')) throw new Error(`Invalid feature: ${f.id}`);
    if (f.requirements !== undefined && !stringList(f.requirements)) throw new Error(`Invalid requirements: ${f.id}`);
    const a = f.audit;
    if (![a.expected, a.observed, a.verification].every(nonempty) || !stringList(a.differences) || !stringList(a.unknowns)) throw new Error(`Incomplete audit: ${f.id}`);
    validateSources(a.sources, f.id);
    if (f.stage && !a.sources.some(s => s.kind === 'historical')) throw new Error(`Missing reference: ${f.id}`);
    if (f.stage === 2 && !a.sources.some(s => s.kind === 'verification')) throw new Error(`Missing verification: ${f.id}`);
    if (a.implementation !== 'not-audited' && !a.sources.some(s => s.kind === 'implementation')) throw new Error(`Missing implementation evidence: ${f.id}`);
    if (a.historical !== 'unreviewed' && !a.sources.some(s => s.kind === 'historical')) throw new Error(`Missing historical evidence: ${f.id}`);
    if ((a.historical === 'verified') !== (f.stage === 2) || (f.stage === 2 && (a.implementation !== 'present' || !a.sources.some(s => s.kind === 'verification') || a.differences.length || a.unknowns.length))) throw new Error(`Unsupported verified verdict: ${f.id}`);
    if (a.historical === 'known-differences' && !a.differences.length) throw new Error(`Missing discrepancy: ${f.id}`);
  }
  if (!Array.isArray(scope.dispositions)) throw new Error('Missing scope dispositions');
  for (const item of scope.dispositions) {
    if (!nonempty(item.name) || !nonempty(item.reason) || !['add', 'covered', 'merge', 'exclude', 'unresolved'].includes(item.disposition) || !stringList(item.covered_by) || !item.covered_by.every(id => features.some(f => f.id === id))) throw new Error(`Invalid scope disposition: ${item.name}`);
    if (['add', 'covered', 'merge'].includes(item.disposition) && !item.covered_by.length) throw new Error(`Unmapped scope disposition: ${item.name}`);
    validateSources(item.sources, item.name);
    if (!item.sources.length) throw new Error(`Missing scope evidence: ${item.name}`);
  }
  const e = features.filter(f => f.stage >= 1).length, v = features.filter(f => f.stage === 2).length, n = features.length;
  if (n !== scope.features || e !== scope.research_accepted || v !== scope.implementation_verified || e + v !== scope.earned || 2 * n !== scope.possible || Number(percentage(features).slice(0, -1)) !== scope.percent) throw new Error('Catalogue totals do not match its gates');
  return { e, v, n, percent: percentage(features) };
}
