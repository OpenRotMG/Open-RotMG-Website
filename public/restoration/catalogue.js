export const implementationLabels = { present: 'Present', partial: 'Partial', missing: 'Missing' };
export const historicalLabels = { verified: 'Verified', partial: 'Partially verified', 'known-differences': 'Known differences', unreviewed: 'Unreviewed' };
export const referenceClient = 'reference-data/client-123.5.1.swf';
export const referenceSha256 = '07ae4fc3ca021a5bf08bbf94f057f7620be18b85e01abd763b3a198382e8fa48';
export const percentage = rows => (100 * rows.reduce((sum, f) => sum + f.stage, 0) / (2 * rows.length)).toFixed(1).replace(/\.0$/, '') + '%';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const stringList = value => Array.isArray(value) && value.every(nonempty);

export function validateSources(sources, id) {
  if (!Array.isArray(sources)) throw new Error(`Invalid sources: ${id}`);
  for (const source of sources) {
    if (!source || ![source.url, source.label].every(nonempty)) throw new Error(`Invalid citation: ${id}`);
    if (source.url === referenceClient) {
      if (source.label !== 'Original 123.5.1 client (SWF reference data)') throw new Error(`Unlabelled reference data: ${id}`);
      continue;
    }
    let url;
    try { url = new URL(source.url); } catch { throw new Error(`Invalid citation URL: ${id}`); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Unsafe citation URL: ${id}`);
    if ([...url.searchParams.keys()].some(key => /token|password|secret|credential|signature|api[_-]?key|authorization/i.test(key))) throw new Error(`Sensitive citation URL: ${id}`);
    const parts = url.pathname.split('/');
    if (['openrotmg.org', 'www.openrotmg.org'].includes(url.hostname) || (['github.com', 'raw.githubusercontent.com'].includes(url.hostname) && (parts[1].toLowerCase() === 'openrotmg' || /^open-rotmg-(server|client|website)$/i.test(parts[2])))) throw new Error(`Project code is not a historical source: ${id}`);
    if ((url.hostname === 'github.com' && ['blob', 'tree'].includes(parts[3]) && !/^[a-f0-9]{40}$/.test(parts[4])) || (url.hostname === 'raw.githubusercontent.com' && !/^[a-f0-9]{40}$/.test(parts[3]))) throw new Error(`Unpinned GitHub citation: ${id}`);
  }
}

export function auditCounts(features) {
  const implementation = Object.fromEntries(Object.keys(implementationLabels).map(key => [key, 0]));
  const historical = Object.fromEntries(Object.keys(historicalLabels).map(key => [key, 0]));
  for (const f of features) {
    if (!f.audit || !Object.hasOwn(implementation, f.audit.implementation) || !Object.hasOwn(historical, f.audit.historical)) throw new Error(`Invalid status: ${f.id}`);
    implementation[f.audit.implementation]++;
    historical[f.audit.historical]++;
  }
  return { implementation, historical };
}

export function validateCatalogue(data) {
  if (data?.scope?.target !== '123.5.1' || !Array.isArray(data.features) || !Array.isArray(data.categories) || !data.features.length || !data.categories.length) throw new Error('Invalid catalogue');
  const { features, categories } = data;
  if (features.some(f => !f || !nonempty(f.id)) || categories.some(c => !c || !nonempty(c.id))) throw new Error('Invalid catalogue entry');
  if (new Set(features.map(f => f.id)).size !== features.length || new Set(categories.map(c => c.id)).size !== categories.length) throw new Error('Duplicate catalogue identifiers');
  for (const c of categories) {
    if (!nonempty(c.name) || typeof c.icon !== 'string' || !features.some(f => f.category === c.id)) throw new Error(`Invalid category: ${c.id}`);
    if (c.unknowns !== undefined && !Array.isArray(c.unknowns)) throw new Error(`Invalid questions: ${c.id}`);
    for (const item of c.unknowns ?? []) {
      if (!nonempty(item.question)) throw new Error(`Empty question: ${c.id}`);
      validateSources(item.sources, c.id);
    }
  }
  auditCounts(features);
  for (const f of features) {
    if (!nonempty(f.name) || ![0, 1, 2].includes(f.stage) || !categories.some(c => c.id === f.category) || (f.icon !== null && typeof f.icon !== 'string')) throw new Error(`Invalid feature: ${f.id}`);
    const a = f.audit;
    if (['observed', 'verification'].some(key => Object.hasOwn(a, key))) throw new Error(`Implementation snapshots do not belong in the catalogue: ${f.id}`);
    if (!nonempty(a.expected) || !stringList(a.differences) || !stringList(a.unknowns)) throw new Error(`Incomplete rules: ${f.id}`);
    validateSources(a.sources, f.id);
    if ((f.stage || a.historical !== 'unreviewed') && !a.sources.length) throw new Error(`Missing historical source: ${f.id}`);
    if ((a.historical === 'verified') !== (f.stage === 2) || (f.stage === 2 && (a.implementation !== 'present' || a.differences.length || a.unknowns.length))) throw new Error(`Unsupported verified verdict: ${f.id}`);
    if (a.historical === 'known-differences' && !a.differences.length) throw new Error(`Missing discrepancy: ${f.id}`);
  }
  const e = features.filter(f => f.stage >= 1).length, v = features.filter(f => f.stage === 2).length, n = features.length;
  return { e, v, n, percent: percentage(features) };
}
