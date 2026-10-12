export const percentage = rows => (100 * rows.reduce((sum, f) => sum + f.stage, 0) / (2 * rows.length)).toFixed(1).replace(/\.0$/, '') + '%';

export function validateCatalogue(data) {
  if (!data?.scope || !Array.isArray(data.features) || !Array.isArray(data.categories) || !data.features.length || !data.categories.length) throw new Error('Invalid catalogue');
  const { features, categories, scope } = data;
  if (new Set(features.map(f => f.id)).size !== features.length || new Set(categories.map(c => c.id)).size !== categories.length) throw new Error('Duplicate catalogue identifiers');
  for (const c of categories) {
    if (typeof c.id !== 'string' || !c.id || typeof c.name !== 'string' || !c.name || typeof c.icon !== 'string') throw new Error(`Invalid category: ${c.id}`);
    if (!features.some(f => f.category === c.id)) throw new Error(`Empty category: ${c.id}`);
  }
  for (const f of features) {
    if (typeof f.id !== 'string' || !f.id || typeof f.name !== 'string' || !f.name || ![0, 1, 2].includes(f.stage) || !categories.some(c => c.id === f.category) || (f.icon !== null && typeof f.icon !== 'string')) throw new Error(`Invalid feature: ${f.id}`);
    if (f.stage && (!f.evidence || typeof f.evidence.reference !== 'string' || !f.evidence.reference.trim() || !Array.isArray(f.evidence.links) || !f.evidence.links.length || !f.evidence.links.every(link => typeof link === 'string' && link.trim()))) throw new Error(`Missing reference: ${f.id}`);
    if (f.stage === 2 && (typeof f.evidence.verification !== 'string' || !f.evidence.verification.trim())) throw new Error(`Missing verification: ${f.id}`);
    if (f.requirements !== undefined && (!Array.isArray(f.requirements) || !f.requirements.every(r => typeof r === 'string' && r.trim()))) throw new Error(`Invalid requirements: ${f.id}`);
  }
  const e = features.filter(f => f.stage >= 1).length, v = features.filter(f => f.stage === 2).length, n = features.length;
  if (n !== scope.features || e !== scope.research_accepted || v !== scope.implementation_verified || e + v !== scope.earned || 2 * n !== scope.possible || Number(percentage(features).slice(0, -1)) !== scope.percent) throw new Error('Catalogue totals do not match its gates');
  return { e, v, n, percent: percentage(features) };
}
