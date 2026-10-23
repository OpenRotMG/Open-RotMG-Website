import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCatalogue,validateEvidence,validateSources,records,matches,workCounts,accepted} from '../public/restoration/catalogue.js';
const load=file=>JSON.parse(readFileSync(new URL('../public/restoration/'+file,import.meta.url),'utf8'));
const catalogue=()=>load('progress.json'),ledger=()=>load('evidence.json');
const digest=values=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
const untestedLedger=()=>{const evidence=ledger();for(const result of Object.values(evidence.results))result.status='not-run';return evidence;};

test('stable 211 parents and 70 components remain separate from evidence',()=>{
  const data=catalogue(),evidence=ledger(),rows=validateEvidence(data,evidence);
  assert.equal(data.features.length,211);assert.equal(data.categories.length,9);assert.equal(rows.length,281);
  assert.equal(new Set(rows.map(r=>r.id)).size,281);
  assert.equal(rows.filter(r=>r.id!==r.feature.id).length,70);
  assert.equal(rows.filter(r=>r.id.startsWith('realm:map-world-')).length,13);
  assert.equal(digest(data.features.map(f=>f.id)),'d4590c87ab5751a89132a40ed16a37258b5f407ba70d9f5be84724a113b9fa3a');
  assert.equal(digest(rows.filter(r=>r.id!==r.feature.id).map(r=>r.id)),'27e5eec1f99db6d2e0c2a0846cbce7471def7dbf165f78679f58a53b33b59bed');
  assert(data.features.every(f=>!accepted(f,evidence)));
  assert(data.features.every(f=>!Object.hasOwn(f,'stage')));
});

test('Hermit loot regressions do not certify full native or historical acceptance',()=>{
  const data=catalogue(),evidence=ledger(),id='realm:hermit-god',ref='hermit-loot-regression-22ecae7';
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert(evidence.results[id].evidence.includes(ref));
  assert.equal(data.features.find(f=>f.id===id).audit.historical,'partial');
  assert.match(evidence.sources[ref].limitations,/not a full native Hermit loot clear/);
});

test('Tomb release records source restoration without inventing full acceptance',()=>{
  const data=catalogue(),evidence=ledger(),ids=['realm:grand-sphinx','dungeons:tomb-of-the-ancients',...['sarcophagus-awakening','trap-switch-and-quicksand','treasure-and-three-boss-completion','ordinary-encounters'].map(x=>'dungeons:tomb-of-the-ancients:'+x)];
  validateEvidence(data,evidence);
  for(const id of ids){
    const row=records(data).find(r=>r.id===id);assert.equal(row.rule.implementation,'present',id);assert.notEqual(row.rule.historical,'verified',id);
    assert.equal(evidence.results[id].status,'not-run',id);assert(evidence.results[id].evidence.includes('tomb-regression-99451ac'));
    assert.equal(accepted(row.feature,evidence),false,id);assert.equal(matches(row,evidence,'verification'),true,id);
  }
  assert.match(evidence.sources['tomb-native-partial-99451ac'].limitations,/One boss, not a complete Tomb acceptance/);
});

test('Snake Pit cover evidence does not accept the full route',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:snake-pit:diggable-route-and-cover';
  validateEvidence(data,evidence);
  const row=records(data).find(r=>r.id===id),result=evidence.results[id];
  assert.equal(row.rule.historical,'partial');assert.equal(result.status,'not-run');
  assert.equal(accepted(row.feature,evidence),false);
  assert.deepEqual(result.evidence,['snake-cover-regression-3778af2','snake-cover-native-3778af2']);
  for(const ref of result.evidence){
    assert.equal(evidence.sources[ref].revision,'3778af2b3146d7bc20a504131f1769c01cf005ad');
    assert.deepEqual(evidence.sources[ref].checks,[id]);
  }
  assert.match(row.rule.unknowns.join(' '),/not the original generator/);
  assert.match(evidence.sources['snake-cover-native-3778af2'].limitations,/not earned.*grate.*minimap/);
});

test('present features remain visible for gameplay and historical work',()=>{
  const data=catalogue(),evidence=untestedLedger(),rows=records(data),kage=rows.find(r=>r.id==='realm:kage-kami');
  assert.equal(matches(kage,evidence,'implementation'),false);
  for(const view of ['work','verification','research','all'])assert.equal(matches(kage,evidence,view),true,view);
  assert.equal(matches(kage,evidence,'accepted'),false);
  const recovery=rows.find(r=>r.id==='access:account-recovery');assert.equal(matches(recovery,evidence,'differences'),true);
  assert.equal(matches(rows.find(r=>r.id==='dungeons:wine-cellar:barrel-destruction'),evidence,'implementation','BARREL'),true);
  assert.equal(matches(kage,evidence,'all','barrel'),false);
  assert.throws(()=>matches(kage,evidence,'unknown'),/Unknown restoration view/);
  assert.equal(workCounts(data.features,evidence).verification,211);
});

test('a passed parent leaves gameplay work without implying historical acceptance',()=>{
  const data=catalogue(),evidence=untestedLedger(),row=records(data).find(r=>r.id==='social:trade-with-players');
  const before=workCounts(data.features,evidence).verification;
  evidence.results[row.id].status='passed';
  assert.equal(workCounts(data.features,evidence).verification,before-1);
  assert.equal(matches(row,evidence,'verification'),false);
  assert.equal(matches(row,evidence,'research'),true);
  assert.equal(accepted(row.feature,evidence),false);
});

test('partial implementation, research and verification can all be outstanding',()=>{
  const data=catalogue(),evidence=ledger(),row=records(data).find(r=>r.id==='dungeons:wine-cellar');
  assert.equal(row.rule.implementation,'partial');
  for(const view of ['implementation','verification','research','differences'])assert.equal(matches(row,evidence,view),true,view);
  assert.match(row.rule.differences.join(' '),/no Wine Barrels.*persistent Slowed\/Sick trail/);
  assert.equal(data.features.find(f=>f.id==='dungeons:wine-cellar').audit.checks.find(c=>c.id.endsWith('barrel-destruction')).group,'layout');
});

test('executed acceptance requires an exact ID, revision and test/native receipt',()=>{
  const data=catalogue(),evidence=ledger(),id='heroes:rogue';
  evidence.results[id].status='passed';assert.throws(()=>validateEvidence(data,evidence),/without test\/native evidence/);
  evidence.sources.test={kind:'source',revision:'a'.repeat(40),date:'2026-10-21',method:'Read the handler',limitations:'No execution',checks:[id],url:'https://github.com/OpenRotMG/Open-RotMG-Server/blob/'+ 'a'.repeat(40)+'/src/world.rs'};
  evidence.results[id].evidence=['test'];assert.throws(()=>validateEvidence(data,evidence),/without test\/native evidence/);
  evidence.sources.test.kind='regression';evidence.sources.test.method='Executed scenario and asserted the saved result';validateEvidence(data,evidence);
  evidence.sources.test.checks=['heroes:wizard'];assert.throws(()=>validateEvidence(data,evidence),/Invalid result binding/);
  evidence.sources.test.checks=[id];evidence.sources.test.revision='main';assert.throws(()=>validateEvidence(data,evidence),/Invalid execution evidence/);
});

test('missing and orphan results fail explicitly instead of assuming untested',()=>{
  const data=catalogue(),evidence=ledger();delete evidence.results['heroes:rogue'];assert.throws(()=>validateEvidence(data,evidence),/Missing or orphan/);
  evidence.results.unknown={status:'not-run',evidence:[]};assert.throws(()=>validateEvidence(data,evidence),/Missing or orphan/);
});

test('one component pass cannot accept its whole feature or historical rules',()=>{
  const data=catalogue(),evidence=ledger(),f=data.features.find(f=>f.id==='dungeons:manor-of-the-immortals'),id=f.audit.checks[0].id;
  evidence.sources.test={kind:'native',revision:'a'.repeat(40),date:'2026-10-21',method:'Ordinary room journey',limitations:'No historical sign-off',checks:[id],url:'https://github.com/OpenRotMG/Open-RotMG-Website/pull/38'};
  evidence.results[id]={status:'passed',evidence:['test']};validateEvidence(data,evidence);
  assert.equal(accepted(f,evidence),false);assert.equal(f.audit.checks[0].historical,'unreviewed');
  for(const rule of [f.audit,...f.audit.checks]){rule.historical='verified';rule.unknowns=[];rule.differences=[];rule.sources=f.audit.sources;}
  assert.equal(accepted(f,evidence),false);
  evidence.sources.test.checks=[f.id,...f.audit.checks.map(c=>c.id)];
  for(const check of evidence.sources.test.checks)evidence.results[check]={status:'passed',evidence:['test']};
  validateEvidence(data,evidence);assert.equal(accepted(f,evidence),true);
  f.audit.checks[0].historical='known-differences';f.audit.checks[0].differences=['Deliberately substituted behavior'];
  assert.equal(accepted(f,evidence),false);
});

test('bad grouping, duplicate IDs and unsupported historical acceptance are rejected',()=>{
  for(const mutate of [c=>c.group='invented',c=>c.id='heroes:rogue',c=>c.acceptance='',c=>c.historical='verified']){
    const data=catalogue();mutate(data.features.find(f=>f.audit.checks).audit.checks[0]);assert.throws(()=>validateCatalogue(data));
  }
  const data=catalogue(),fs=data.features.filter(f=>f.audit.checks);fs[1].audit.checks[0].id=fs[0].audit.checks[0].id;assert.throws(()=>validateCatalogue(data),/Invalid component/);
});

test('historical references cannot be implementation PRs or unpinned code',()=>{
  for(const url of ['https://github.com/OpenRotMG/Open-RotMG-Server/blob/'+ 'a'.repeat(40)+'/src/world.rs','https://openrotmg.org/restoration/','https://github.com/trapped/rotmg_svr/blob/main/file.cs'])assert.throws(()=>validateSources([{url,label:'probe'}],'probe'));
});

test('category and condition sprites stay original and distinct',()=>{
  const data=catalogue(),icons=Object.fromEntries(data.categories.map(c=>[c.id,c.icon]));assert.notEqual(icons.heroes,icons.access);
  assert.equal(icons.conditions,data.features.find(f=>f.name==='Armor broken').icon);
  for(const path of Object.values(icons)){const bytes=readFileSync(new URL('../public/restoration/'+path,import.meta.url));assert.equal(bytes.subarray(1,4).toString(),'PNG');assert(bytes.readUInt32BE(16)>0&&bytes.readUInt32BE(20)>0);}
});
