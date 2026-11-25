import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateEvidence } from '../public/restoration/catalogue.js';

const refFor = id => `xml-final:${id}`;
const priorRef = (id, job) => `xml-prior:${job.split('/').at(-1)}:${id}`;
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const repo = 'https://github.com/OpenRotMG/Open-RotMG-Server';

export function withoutNativeBindings(evidence) {
  const base = structuredClone(evidence);
  for (const [ref, source] of Object.entries(base.sources)) {
    if (!ref.startsWith(refFor(''))) continue;
    for (const id of source.checks) {
      const result = base.results[id];
      result.evidence = result.evidence.filter(key => key !== ref);
      if (source.binding.passes.includes(id)) result.status = 'not-run';
    }
    delete base.sources[ref];
  }
  return base;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => /^[a-f0-9]{64}$/.test(value);
const revisionHash = value => /^[a-f0-9]{40}$/.test(value);
const casePath = /^(?:scripts\/cases|examples\/testing)\/[\w.-]+\.mjs$/;

export function bindNative(evidence, inventory, scope, map, caseHash, dependencies) {
  const base = withoutNativeBindings(evidence), m = base.migration;
  assert.deepEqual([inventory.case_head, inventory.revision, inventory.runtime_revision, inventory.expected_source_data_fingerprint],
    [m.revision, m.packageRevision, m.runtimeRevision, m.fingerprint], 'Native ledger does not match the pinned candidate');
  assert.deepEqual([scope.case_head, scope.runtime_head, scope.ledger_sha256, scope.data_fingerprint, scope.binary_sha256,
    scope.runtime_archive_sha256], [m.revision, m.runtimeRevision, m.ledgerSha256, m.fingerprint, m.binarySha256, m.packageSha256],
    'Scope does not match the pinned candidate');
  if (Object.hasOwn(scope, 'local_equal_archive_sha256')) {
    assert.equal(scope.local_equal_archive_sha256, m.localPackageSha256, 'Scope local-equal archive differs from the ledger');
  }
  const release = inventory.package;
  assert.deepEqual([release.revision, release.archive_sha256, release.local_equal_archive_sha256, release.binary_sha256,
    release.all_member_bytes_modes_sizes_identical], [m.packageRevision, m.packageSha256, m.localPackageSha256,
    m.binarySha256, true], 'Native archive pins differ');
  const clientInput = Object.hasOwn(scope, 'local_client_sha256') ? 'localClient' : 'clientManifest';
  const clientSha = clientInput === 'localClient' ? scope.local_client_sha256 : scope.client_manifest_sha256;
  assert(hash(clientSha), 'Invalid native client pin');
  delete m.unaffected;
  for (const result of Object.values(base.results)) {
    if (result.status === 'not-run') continue;
    result.prior = result.status;
    result.status = 'not-run';
  }
  const archives = new Set([m.packageSha256, m.localPackageSha256]), overlays = new Map();
  for (const overlay of scope.case_overlays) {
    assert(hash(overlay.archive_sha256) && !archives.has(overlay.archive_sha256) && !overlays.has(overlay.archive_sha256) &&
      archives.has(overlay.base_archive_sha256) && overlay.binary_sha256 === m.binarySha256 && revisionHash(overlay.revision) &&
      Number.isSafeInteger(overlay.unchanged_data_members) && overlay.unchanged_data_members > 0 &&
      overlay.changed_members.length && overlay.changed_members.every(file => file === 'REVISION' ||
        /^docs\/xml-migration-(test-map|differences)\.md$/.test(file) || casePath.test(file)), 'Invalid case-only overlay');
    overlays.set(overlay.archive_sha256, overlay);
  }
  const rows = new Map(inventory.rows.map(row => [row.id, row]));
  const scoped = new Map(scope.rows.map(row => [row.id, row]));
  assert(rows.size === inventory.rows.length && scoped.size === scope.rows.length && rows.size === scoped.size &&
    rows.size === scope.selected_count && rows.size === inventory.total && inventory.scope.trim(), 'Invalid ledger/scope inventory');
  const observed = new Map();
  for (const [id, [caseSha, proofScope]] of Object.entries(map.cases)) {
    const row = rows.get(id), selected = scoped.get(id);
    assert(row && selected && row.status === selected.status && row.case === selected.case, `Ledger/scope row mismatch: ${id}`);
    const file = selected.case;
    assert(casePath.test(file), `Unexpected case path: ${id}`);
    assert.equal(selected.proof_scope, proofScope, `Re-review changed proof scope for ${id}`);
    assert.equal(selected.case_sha256, caseSha, `Re-review changed case ${id}`);
    let receipt, disposition;
    if (selected.status === 'passed') {
      receipt = selected.final_executable_receipt;
      assert.deepEqual(receipt, row.final_executable_receipt, `Scope receipt mismatch: ${id}`);
      assert(receipt?.status === 'passed' && archives.has(receipt.archive_sha256) &&
        revisionHash(receipt.case_revision) && receipt.case_sha256 === caseSha &&
        receipt.binary_sha256 === m.binarySha256 && receipt.observed_inputs?.serverBinary === m.binarySha256 &&
        receipt.observed_inputs[clientInput] === clientSha && receipt.data_fingerprint === m.fingerprint &&
        caseHash(m.revision, file) === caseSha && caseHash(receipt.case_revision, file) === caseSha,
      `Unqualified final-executable receipt: ${id}`);
      // A replay may use case files from a verified overlay while retaining the base ELF and data.
      if (Object.hasOwn(receipt, 'case_overlay_sha256')) {
        const overlay = overlays.get(receipt.case_overlay_sha256);
        assert(overlay && overlay.base_archive_sha256 === receipt.archive_sha256 && overlay.affected_case_ids.includes(id) &&
          caseHash(overlay.revision, file) === caseSha, `Unqualified case overlay: ${id}`);
      } else assert.equal(caseHash(m.packageRevision, file), caseSha, `Case differs from the base archive: ${id}`);
      disposition = 'final-executable';
    } else if (selected.status === 'historical_carry_only') {
      if (caseHash(m.revision, file) !== caseSha) continue;
      assert(selected.scope_rationale?.length && selected.final_executable_receipt === null &&
        row.case_sha256 === caseSha && row.proof_scope === proofScope && !archives.has(row.package_sha256) && !overlays.has(row.package_sha256) &&
        (row.binary_sha256 !== m.binarySha256 || row.data_fingerprint !== m.fingerprint) &&
        row.case_revision === row.source?.head && caseHash(row.case_revision, file) === caseSha,
      `Unqualified carry-only receipt: ${id}`);
      assert.deepEqual(selected.carry_capture, {job: row.job, binary_sha256: row.binary_sha256,
        package_sha256: row.package_sha256, data_fingerprint: row.data_fingerprint, case_sha256: caseSha},
      `Carry capture mismatch: ${id}`);
      const capture = [...row.attempts, row.historical_receipt].find(proof => proof?.status === 'passed' && proof.job === row.job);
      assert(capture, `Missing passed attempt for carry: ${id}`);
      for (const field of ['collection', 'assertions', 'source', 'observed_inputs', 'data_fingerprint', 'returncode', 'data_variant_actors_sha256', 'variant']) {
        assert.deepEqual(capture[field], row[field], `Carry attempt ${field} mismatch: ${id}`);
      }
      assert(row.source.dirty === false && row.observed_inputs.serverBinary === row.binary_sha256 &&
        !row.data_variant_actors_sha256, `Invalid carry capture: ${id}`);
      receipt = {...row, status: capture.status, archive_sha256: row.package_sha256};
      disposition = 'carry-only';
    } else continue;
    const job = receipt.job?.match(/openrotmg\/qa-jobs\/[a-f0-9]{32}$/)?.[0];
    assert(receipt.status === 'passed' && receipt.returncode === 0 && receipt.collection?.status === 'reclaimed' &&
      receipt.assertions?.length && job && receipt.observed_inputs?.case === caseSha &&
      hash(receipt.archive_sha256) && hash(receipt.observed_inputs.serverBinary), `Unqualified native receipt: ${id}`);
    assert.deepEqual([row.case_sha256, row.proof_scope], [caseSha, proofScope], `Ledger/scope case mismatch: ${id}`);
    observed.set(id, {receipt, file, proofScope, job, disposition, env: {variant: row.variant, runtime: row.runtime_env}});
  }
  const pairs = dependencies([...observed].map(([id, {file, receipt, env}]) => [id, file, env, receipt.case_revision, receipt.data_fingerprint]));
  m.dependencies = {};
  const qualifying = new Set();
  for (const [id, {disposition, receipt, job}] of observed) {
    const [target, captured] = pairs[id];
    const earlier = evidence.sources[priorRef(id, job)] ?? evidence.sources[refFor(id)];
    if (captured === null && earlier?.revision === receipt.case_revision && earlier.fingerprint === receipt.data_fingerprint &&
        earlier.binding.job === job && earlier.binding.caseSha256 === receipt.case_sha256 &&
        earlier.binding.packageSha256 === receipt.archive_sha256 && earlier.binding.binarySha256 === receipt.observed_inputs.serverBinary) {
      pairs[id][1] = earlier.binding.dependencyFingerprint;
    }
    assert(hash(target) && (pairs[id][1] === null || hash(pairs[id][1])), `Invalid scoped data proof: ${id}`);
    m.dependencies[id] = target;
    if (target === pairs[id][1]) qualifying.add(id);
    else assert.equal(disposition, 'carry-only', `Final-executable dependencies differ for ${id}`);
  }
  for (const [id, check] of Object.entries(map.checks)) {
    assert(base.results[id]?.status === 'not-run', `Not a pending check: ${id}`);
    assert(typeof check.promote === 'boolean' && typeof check.limits === 'string' && check.limits.trim() && check.cases.length && new Set(check.cases).size === check.cases.length && check.cases.every(name => Object.hasOwn(map.cases, name)), `Invalid mapping for ${id}`);
    if (check.promote && check.cases.every(name => qualifying.has(name))) base.results[id].status = 'passed';
  }
  for (const [name, {receipt, file, proofScope, job, disposition}] of observed) {
    const matches = Object.entries(map.checks).filter(([, check]) => check.cases.includes(name));
    assert(matches.length, `Unused reviewed case: ${name}`);
    const [, dependencyFingerprint] = pairs[name];
    if (dependencyFingerprint === null) continue;
    const ref = qualifying.has(name) ? refFor(name) : priorRef(name, job), checks = matches.map(([id]) => id);
    base.sources[ref] = {
      kind: 'native', revision: receipt.case_revision, fingerprint: receipt.data_fingerprint,
      date: new Date(receipt.collection.time * 1000).toISOString().slice(0, 10),
      url: `${repo}/blob/${receipt.case_revision}/${file}`, checks,
      method: `${name}: ${receipt.assertions.length} observed assertions in the final native ledger.`,
      limitations: 'Candidate gameplay evidence, not historical sign-off.',
      binding: {caseSha256: receipt.case_sha256, packageSha256: receipt.archive_sha256, binarySha256: receipt.observed_inputs.serverBinary,
        ...(receipt.case_overlay_sha256 && {caseOverlaySha256: receipt.case_overlay_sha256}),
        dependencyFingerprint, scopeSha256: m.scopeSha256, job, scope: proofScope, disposition,
        basis: disposition === 'final-executable' ? 'Final-executable rerun' :
          'Earlier native capture reviewed against the executable delta; only matching case dependency fingerprints carry forward',
        limits: Object.fromEntries(matches.map(([id, check]) => [id, check.limits])), passes: checks.filter(id => qualifying.has(name) && base.results[id].status === 'passed')}
    };
    for (const id of checks) if (!base.results[id].evidence.includes(ref)) base.results[id].evidence.push(ref);
  }
  for (const [ref, source] of Object.entries(evidence.sources)) {
    if (!ref.startsWith(refFor('')) || base.sources[ref]?.binding.job === source.binding.job) continue;
    const archived = priorRef(ref.slice(refFor('').length), source.binding.job);
    base.sources[archived] ??= source;
    for (const id of source.checks) {
      const result = base.results[id];
      if (!result.evidence.includes(archived)) result.evidence.push(archived);
    }
  }
  for (const result of Object.values(base.results)) {
    const generated = result.evidence.filter(ref => /^xml-(final|prior):/.test(ref));
    result.evidence = [...result.evidence.filter(ref => !generated.includes(ref)), ...generated.sort()];
  }
  return base;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert([6, 7].includes(process.argv.length), 'Usage: node tools/bind-restoration-native.mjs FINAL_NATIVE_LEDGER.json FINAL_EXECUTABLE_SCOPE.json SERVER_CHECKOUT XML_PRODUCTION_CLOSURE.json [DROP_RATES_API.json]');
  const path = new URL('../public/restoration/evidence.json', import.meta.url);
  const text = readFileSync(path, 'utf8');
  const progress = read(new URL('../public/restoration/progress.json', import.meta.url));
  const base = JSON.parse(text), {migration: m} = base;
  const [ledgerBytes, scopeBytes] = process.argv.slice(2, 4).map(file => readFileSync(file));
  const inventory = JSON.parse(ledgerBytes), scope = JSON.parse(scopeBytes);
  const [, , , , server, compiled, dropRatesFile] = process.argv;
  const reviewedRevision = execFileSync('git', ['-C', server, 'rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  assert(revisionHash(scope.case_head), 'Invalid case head');
  execFileSync('git', ['-C', server, 'merge-base', '--is-ancestor', scope.case_head, reviewedRevision]);
  Object.assign(m, {revision: scope.case_head, reviewedRevision, runtimeRevision: scope.runtime_head, packageRevision: inventory.package.revision,
    fingerprint: scope.data_fingerprint,
    binarySha256: scope.binary_sha256, packageSha256: scope.runtime_archive_sha256, localPackageSha256: inventory.package.local_equal_archive_sha256,
    date: inventory.recorded_at_utc.slice(0, 10), url: `${repo}/commit/${reviewedRevision}`,
    ledgerSha256: sha256(ledgerBytes), scopeSha256: sha256(scopeBytes)});
  m.compilerClosureSha256 = sha256(readFileSync(compiled));
  let dropFixture;
  if (dropRatesFile) {
    const bytes = readFileSync(dropRatesFile), receipt = JSON.parse(bytes);
    assert.deepEqual([receipt.schema_version, receipt.revision, receipt.content_fingerprint],
      [2, m.packageRevision, m.fingerprint], 'Drop rates do not match the packaged server');
    const prior = read(new URL('./drop-rates.fixture.json', import.meta.url));
    const select = (field, id) => prior[field].map(old => {
      const hits = receipt[field].filter(row => row[id] === old[id]);
      assert.equal(hits.length, 1, `Missing or duplicate drop-rate fixture ${field}: ${old[id]}`);
      return hits[0];
    });
    dropFixture = {...receipt, objects: select('objects', 'id'), items: select('items', 'id'),
      landmark_chests: select('landmark_chests', 'landmark')};
    m.dropRatesReceiptSha256 = sha256(bytes);
  }
  if (scope.qualification !== undefined) {
    assert(typeof scope.qualification === 'string' && scope.qualification.trim(), 'Missing scope qualification');
    m.qualification = scope.qualification;
  }
  const evidence = bindNative(base, inventory, scope, read(new URL('./restoration-native-map.json', import.meta.url)),
    (revision, file) => {
      assert(revisionHash(revision), `Not a committed server revision: ${revision}`);
      return sha256(execFileSync('git', ['-C', server, 'show', `${revision}:${file}`]));
    }, requests => JSON.parse(execFileSync('python3', [fileURLToPath(new URL('./restoration-dependencies.py', import.meta.url)), server, compiled],
      {input: JSON.stringify([m.revision, m.fingerprint, requests])})));
  validateEvidence(progress, evidence);
  const generated = Object.entries(evidence.sources).filter(([key]) => /^xml-(final|prior):/.test(key)).sort(([a],[b]) => a.localeCompare(b));
  // Keep recorded pre-migration receipts verbatim.
  const next = text.replace(/^  "migration": .*$/m, () => `  "migration": ${JSON.stringify(evidence.migration)},`)
    .replace(/^    "xml-(final|prior):[^\n]*\n/gm, '').replace('  "sources": {\n',
      `  "sources": {\n${generated.map(([key, source]) => `    ${JSON.stringify(key)}: ${JSON.stringify(source)},\n`).join('')}`)
    .replace(/\n  "results": \{[\s\S]+$/, () => `\n  "results": {\n${Object.entries(evidence.results)
      .map(([id, result]) => `    ${JSON.stringify(id)}: ${JSON.stringify(result)}`).join(',\n')}\n  }\n}\n`);
  assert.deepEqual(JSON.parse(next), evidence, 'Generated evidence did not match the ledger on disk');
  writeFileSync(path, next);
  if (dropFixture) writeFileSync(new URL('./drop-rates.fixture.json', import.meta.url), JSON.stringify(dropFixture)+'\n');
  const active = generated.filter(([key]) => key.startsWith(refFor('')));
  const final = active.filter(([, source]) => source.binding.disposition === 'final-executable').length;
  console.log(`${final} final-executable rows; ${active.length - final} dependency-matched carry rows; ${generated.length - active.length} prior rows; ${Object.values(evidence.results).filter(r => r.status === 'passed').length} passed checks`);
}
