export const implementationLabels = {present:'Present in source', partial:'Partial in source', missing:'Missing in source'};
export const historicalLabels = {verified:'Accepted', partial:'Partially researched', 'known-differences':'Known difference', unreviewed:'Not reviewed'};
export const functionalLabels = {'not-run':'Not recorded', passed:'Passed', failed:'Failed'};
export const provenanceLabels = {preserved:'Preserved definition', authored:'Authored reconstruction', corrected:'Corrected definition'};
// Workflow order improves scanning without making these overlapping filters sequential stages: https://github.com/OpenRotMG/Open-RotMG-Server/issues/735
export const views = {work:'All unfinished work', research:'Needs research', implementation:'Needs implementation', verification:'Needs verification', differences:'Known differences', accepted:'Accepted features', all:'All features and checks'};
export const groups = {maps:'Classic map identities', geography:'Geography and routes', scenery:'Scenery and landmarks', populations:'Populations and encounter lifecycle', admission:'Entry', layout:'Layout and objects', population:'Populations', boss:'Boss encounter', rewards:'Rewards and exit', behavior:'Behavior and presentation'};
export const dungeonGates = {admission:'Use each supported earned, key or chained entrance. Shared entry reaches the same instance; denied entry consumes nothing.',layout:'Traverse entrance to objectives, boss and exit. Verify room roles, cover, destructibles, hazards and seeded or fixed-map qualifications.',population:'Encounter ordinary room families and dependent actors naturally. Verify bounded summons, splits, transformations and cleanup.',boss:'Exercise activation, vulnerability, phases and actual defeat, including group completion where applicable.',rewards:'Earn eligible rewards, committed clear credit and a usable exit with the same character. Reject duplicate rewards and cross-instance state.'};
export const referenceClient = 'reference-data/client-123.5.1.swf';
export const referenceSha256 = '07ae4fc3ca021a5bf08bbf94f057f7620be18b85e01abd763b3a198382e8fa48';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const strings = value => Array.isArray(value) && value.every(nonempty);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const fingerprint = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = value => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const require = (valid,message) => { if (!valid) throw new Error(message); };
function publicUrl(value) {
  let url; try { url = new URL(value); } catch { throw new Error('Invalid evidence URL'); }
  require(url.protocol === 'https:' && !url.username && !url.password,'Unsafe evidence URL');
  require(![...url.searchParams.keys()].some(key=>/token|password|secret|credential|signature|api[_-]?key|authorization/i.test(key)),'Sensitive evidence URL');
  return url;
}
// Only byte-preserved third-party artifacts under data/reference may be cited from the project repository.
const preservedArtifact = url => { const p=url.pathname.split('/'); return url.hostname==='github.com' && p[1]==='OpenRotMG' && p[2]==='Open-RotMG-Server' && p[3]==='blob' && sha(p[4]) && p[5]==='data' && p[6]==='reference' && p.length>7; };
export function validateSources(sources,id) {
  require(Array.isArray(sources),`Invalid sources: ${id}`);
  for (const source of sources) {
    require(source && [source.url,source.label].every(nonempty),`Invalid citation: ${id}`);
    if (source.url === referenceClient) { require(source.label === 'Original 123.5.1 client (SWF reference data)',`Unlabelled reference data: ${id}`); continue; }
    const url=publicUrl(source.url), parts=url.pathname.split('/');
    if (preservedArtifact(url)) { require(nonempty(source.qualification),`Unqualified preserved artifact: ${id}`); continue; }
    require(!(['openrotmg.org','www.openrotmg.org'].includes(url.hostname) || (['github.com','raw.githubusercontent.com'].includes(url.hostname) && (parts[1].toLowerCase()==='openrotmg' || /^open-rotmg-(server|client|website)$/i.test(parts[2])))),`Project code is not a historical source: ${id}`);
    if ((url.hostname==='github.com' && ['blob','tree'].includes(parts[3])) || url.hostname==='raw.githubusercontent.com') require(sha(parts[url.hostname==='github.com'?4:3]),`Unpinned GitHub citation: ${id}`);
  }
}
function validateRuntime(rule,id) {
  require(rule.priorEngine === undefined || (strings(rule.priorEngine) && rule.priorEngine.length>0),`Invalid prior-engine history: ${id}`);
  if (rule.runtime === undefined) return;
  require(Array.isArray(rule.runtime) && rule.runtime.length>0,`Invalid runtime sources: ${id}`);
  for (const fact of rule.runtime) {
    require(fact && Object.keys(fact).every(key=>['provenance','fact','url','artifact'].includes(key)) && Object.hasOwn(provenanceLabels,fact.provenance) && nonempty(fact.fact),`Invalid runtime source: ${id}`);
    publicUrl(fact.url);
    require((fact.provenance!=='preserved' || fact.artifact!==undefined) && (fact.artifact===undefined || preservedArtifact(publicUrl(fact.artifact))),`Preserved definition without pinned artifact: ${id}`);
  }
}
export const checks = f => f.audit.checks === undefined ? [] : f.audit.checks;
export const records = data => data.features.flatMap(f=>[{id:f.id,feature:f,rule:f.audit},...checks(f).map(c=>({id:c.id,feature:f,rule:c}))]);
export function validateCatalogue(data) {
  require(data?.scope?.target==='123.5.1' && Array.isArray(data.features) && data.features.length && Array.isArray(data.categories) && data.categories.length,'Invalid catalogue');
  const ids=new Set();
  for (const c of data.categories) {
    require(c && [c.id,c.name,c.summary].every(nonempty) && typeof c.icon==='string' && !ids.has(c.id), 'Invalid category'); ids.add(c.id);
    if (c.unknowns !== undefined) { require(Array.isArray(c.unknowns),`Invalid questions: ${c.id}`); for (const q of c.unknowns) { require(nonempty(q.question),`Empty question: ${c.id}`); validateSources(q.sources,c.id); } }
  }
  for (const f of data.features) {
    require(f && [f.id,f.name].every(nonempty) && !ids.has(f.id) && data.categories.some(c=>c.id===f.category) && (f.icon===null || typeof f.icon==='string'), 'Invalid feature'); ids.add(f.id);
  }
  for (const f of data.features) {
    const a=f.audit;
    require(a && Object.hasOwn(implementationLabels,a.implementation) && Object.hasOwn(historicalLabels,a.historical) && nonempty(a.expected) && strings(a.differences) && strings(a.unknowns),`Incomplete rules: ${f.id}`);
    require(!['observed','verification','stage','functional'].some(key=>Object.hasOwn(a,key)) && !Object.hasOwn(f,'stage'),`Legacy status field: ${f.id}`);
    validateSources(a.sources,f.id); require(a.sources.length>0,`Missing historical source: ${f.id}`); validateRuntime(a,f.id);
    if (a.historical==='verified') require(!a.differences.length && !a.unknowns.length,`Unsupported historical acceptance: ${f.id}`);
    if (a.historical==='known-differences') require(a.differences.length>0,`Missing discrepancy: ${f.id}`);
    if (a.checks !== undefined) require(Array.isArray(a.checks) && a.checks.length>0,`Invalid component checklist: ${f.id}`);
    for (const c of checks(f)) {
      require(c && [c.id,c.name,c.expected,c.acceptance].every(nonempty) && !ids.has(c.id) && Object.hasOwn(groups,c.group) && Object.hasOwn(implementationLabels,c.implementation) && Object.hasOwn(historicalLabels,c.historical) && strings(c.differences) && strings(c.unknowns),`Invalid component check: ${f.id}`); ids.add(c.id);
      require(!['status','proof','functional'].some(key=>Object.hasOwn(c,key)),`Legacy component status: ${c.id}`);
      validateSources(c.sources,c.id); validateRuntime(c,c.id);
      if(c.historical==='verified') require(c.sources.length>0 && !c.unknowns.length && !c.differences.length,`Unsupported historical acceptance: ${c.id}`);
      if(c.historical==='known-differences') require(c.differences.length>0,`Missing discrepancy: ${c.id}`);
    }
  }
  for(const c of data.categories) require(data.features.some(f=>f.category===c.id),`Empty category: ${c.id}`);
  return records(data);
}
export function validateEvidence(data,evidence) {
  const rows=validateCatalogue(data), ids=new Set(rows.map(r=>r.id));
  const review=evidence?.sourceReview;
  require(review && sha(review.revision) && date(review.date) && nonempty(review.qualification),'Invalid source-review snapshot'); publicUrl(review.url);
  require(evidence.sources && typeof evidence.sources==='object' && !Array.isArray(evidence.sources) && evidence.results && typeof evidence.results==='object' && !Array.isArray(evidence.results),'Invalid evidence ledger');
  require(Object.keys(evidence.results).length===ids.size && Object.keys(evidence.results).every(id=>ids.has(id)),'Missing or orphan evidence result');
  const m=evidence.migration;
  require(m && sha(m.from) && sha(m.revision) && sha(m.reviewedRevision) && sha(m.runtimeRevision) && sha(m.packageRevision) && [m.fingerprint,m.packageSha256,m.binarySha256,m.localPackageSha256,m.scopeSha256,m.ledgerSha256,m.dropRatesReceiptSha256,m.compilerClosureSha256].every(fingerprint) && date(m.date) && nonempty(m.qualification) && m.dependencies && typeof m.dependencies==='object' && !Array.isArray(m.dependencies) && Object.entries(m.dependencies).every(([id,hash])=>/^[\w.-]+$/.test(id) && fingerprint(hash)),'Invalid XML migration record'); publicUrl(m.url);
  for(const [key,s] of Object.entries(evidence.sources)) {
    require(s && ['source','regression','native'].includes(s.kind) && sha(s.revision) && date(s.date) && [s.method,s.limitations].every(nonempty) && strings(s.checks) && s.checks.length && new Set(s.checks).size===s.checks.length && s.checks.every(id=>ids.has(id)),`Invalid execution evidence: ${key}`); publicUrl(s.url);
    if(s.kind==='source') { const u=new URL(s.url),p=u.pathname.split('/'); require(['github.com','raw.githubusercontent.com'].includes(u.hostname) && p[u.hostname==='github.com'?4:3]===s.revision,`Unpinned source evidence: ${key}`); }
    require(s.fingerprint===undefined || fingerprint(s.fingerprint),`Wrong runtime fingerprint: ${key}`);
    if(s.binding!==undefined || /^xml-(final|prior):/.test(key)){
      const b=s.binding, active=key.startsWith('xml-final:');
      require(b && s.kind==='native' && [s.fingerprint,b.caseSha256,b.packageSha256,b.binarySha256,b.dependencyFingerprint,b.scopeSha256].every(fingerprint) &&
        (b.disposition==='final-executable' || b.disposition==='carry-only') &&
        (b.caseOverlaySha256===undefined || b.disposition==='final-executable' && fingerprint(b.caseOverlaySha256)) &&
        (!active || (b.scopeSha256===m.scopeSha256 && Object.hasOwn(m.dependencies,key.slice('xml-final:'.length)) &&
          (b.disposition==='final-executable' ? s.fingerprint===m.fingerprint && b.binarySha256===m.binarySha256 &&
            [m.packageSha256,m.localPackageSha256].includes(b.packageSha256) :
            ![m.packageSha256,m.localPackageSha256].includes(b.packageSha256) &&
            (s.fingerprint!==m.fingerprint || b.binarySha256!==m.binarySha256)))) &&
        ['earned','prepared','protected'].includes(b.scope) && /^openrotmg\/qa-jobs\/[a-f0-9]{32}$/.test(b.job) && nonempty(b.basis) &&
        b.limits && Object.keys(b.limits).length===s.checks.length && s.checks.every(id=>nonempty(b.limits[id])) &&
        strings(b.passes) && b.passes.every(id=>s.checks.includes(id)) && /^xml-(final|prior):/.test(key) &&
        ['scripts/cases', 'examples/testing'].some(path=>s.url.startsWith(`https://github.com/OpenRotMG/Open-RotMG-Server/blob/${s.revision}/${path}/`)),`Invalid native binding: ${key}`);
    }
  }
  for(const row of rows) {
    const result=evidence.results[row.id];
    require(result && Object.keys(result).every(key=>['status','evidence','prior'].includes(key)) && Object.hasOwn(functionalLabels,result.status) && strings(result.evidence) && result.evidence.every(ref=>Object.hasOwn(evidence.sources,ref) && evidence.sources[ref].checks.includes(row.id)),`Invalid result binding: ${row.id}`);
    if(result.status!=='not-run') require(result.evidence.some(ref=>evidence.sources[ref].kind!=='source'),`Executed result without test/native evidence: ${row.id}`);
    require(result.prior===undefined || ['passed','failed'].includes(result.prior),`Invalid prior-engine result: ${row.id}`);
    if(result.status!=='not-run') {
      const proofs=result.evidence.filter(ref=>ref.startsWith('xml-final:') && evidence.sources[ref].binding.passes.includes(row.id));
      require(result.status==='passed' && proofs.length && proofs.every(ref=>current(evidence,ref)),`Stale ${result.status} after XML migration: ${row.id}`);
    }
    for(const fact of row.rule.runtime??[]) require(/^https:\/\/github\.com\/OpenRotMG\/Open-RotMG-Server\/blob\/[a-f0-9]{40}\//.test(fact.url),`Runtime source not commit-pinned: ${row.id}`);
  }
  for(const [key,s] of Object.entries(evidence.sources)) require(s.checks.every(id=>evidence.results[id].evidence.includes(key)),`Unbound execution evidence: ${key}`);
  return rows;
}
// A carry keeps its original capture identity; only its check cohort's data is compared.
export function current(evidence,ref) {
  const target=evidence.migration.dependencies[ref.slice('xml-final:'.length)];
  return ref.startsWith('xml-final:') && fingerprint(target) && evidence.sources[ref].binding?.dependencyFingerprint===target;
}
export function accepted(f,evidence) {
  return [{id:f.id,...f.audit},...checks(f)].every(r=>r.implementation==='present' && r.historical==='verified' && !r.differences.length && !r.unknowns.length && evidence.results[r.id].status==='passed');
}
export function matches(row,evidence,view,query='') {
  require(Object.hasOwn(views,view),`Unknown restoration view: ${view}`);
  const r=row.rule, functional=evidence.results[row.id].status;
  const flags={implementation:r.implementation!=='present',verification:functional!=='passed',research:r.historical!=='verified' && (r.historical!=='known-differences' || r.unknowns.length>0),differences:r.historical==='known-differences' || r.differences.length>0};
  const visible=view==='all' || (view==='accepted'?accepted(row.feature,evidence):view==='work'?Object.values(flags).some(Boolean):flags[view]);
  return visible && [row.id,row.feature.name,r.name,r.expected,...r.differences,...r.unknowns,...(r.priorEngine??[]),...(r.runtime??[]).map(f=>f.fact)].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase().trim());
}
export function workCounts(features,evidence) {
  return Object.fromEntries(['implementation','verification','research','differences'].map(view=>[view,features.filter(f=>[{id:f.id,feature:f,rule:f.audit},...checks(f).map(c=>({id:c.id,feature:f,rule:c}))].some(row=>matches(row,evidence,view))).length]));
}
