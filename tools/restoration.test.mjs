import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateCatalogue,validateEvidence,validateSources,records,matches,workCounts,accepted,views} from '../public/restoration/catalogue.js';
const load=file=>JSON.parse(readFileSync(new URL('../public/restoration/'+file,import.meta.url),'utf8'));
const catalogue=()=>load('progress.json'),ledger=()=>load('evidence.json');
const digest=values=>createHash('sha256').update(JSON.stringify(values)).digest('hex');
const untestedLedger=()=>{const evidence=ledger();for(const result of Object.values(evidence.results))result.status='not-run';return evidence;};

test('gallery ordinary passes do not certify administrative export or original history',()=>{
  const data=catalogue(),evidence=ledger(),id='access:player-art-gallery',feature=data.features.find(f=>f.id===id);validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.deepEqual(evidence.results[id].evidence,['gallery-research-53587151','gallery-native-41ba534a','gallery-cold-http-41ba534a']);
  assert.match(feature.audit.differences.join(' '),/does not issue gallery Admin/);
  assert.match(evidence.sources['gallery-native-41ba534a'].method,/17 native assertions/);assert.match(evidence.sources['gallery-cold-http-41ba534a'].method,/12 HTTP assertions/);
});

test('Guild Hall first-upgrade acceptance does not certify original layouts or every tier',()=>{
  const data=catalogue(),evidence=ledger(),id='social:guild-hall',component=id+':shared-access-and-first-upgrade',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.equal(evidence.results[component].status,'passed');
  for(const kind of ['native','regression'])assert(evidence.results[component].evidence.some(ref=>evidence.sources[ref].kind===kind&&evidence.sources[ref].checks.includes(id)));
  assert.match(feature.audit.unknowns.join(' '),/250,000.*production price/);
});

test('reconnect research preserves idle proof without accepting original server timing',()=>{
  const data=catalogue(),evidence=ledger(),id='access:reconnect-safely',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.equal(evidence.results[id].status,'passed');
  assert.equal(evidence.results['access:idle-disconnect'].status,'passed');
  assert.equal(evidence.sources['reconnect-native-aa4e65d0'].kind,'native');
  assert(evidence.results[id].evidence.includes('reconnect-native-aa4e65d0'));
  assert(evidence.results['access:world-loading-presentation'].evidence.includes('reconnect-native-aa4e65d0'));
  assert(evidence.results[id].evidence.includes('idle-first-return-durable-native-b693808'));
  assert.equal(evidence.results['access:world-loading-presentation'].status,'not-run');
  assert.match(feature.audit.unknowns.join(' '),/expiry, reuse and death\/transfer/);
  for(const record of [feature,...feature.audit.checks]){
    const rule=record.audit??record;assert.equal(rule.historical,'partial');
    assert(evidence.results[record.id].evidence.includes('reconnect-research-a07c62f8'));
  }
  assert.match(evidence.sources['reconnect-research-a07c62f8'].limitations,/not native minimum-display\/fade/);
});

test('Tutorial research keeps whole-feature acceptance separate from period reward identities',()=>{
  const data=catalogue(),evidence=ledger(),id='home:tutorial-and-kitchen',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  for(const ref of ['tutorial-research-f76c012','tutorial-lessons-native-21d1872','chicken-combat-exit-native-c33aa99','kitchen-encounters-native-940cb49'])assert(evidence.results[id].evidence.includes(ref));
  assert.match(feature.audit.unknowns.join(' '),/no probabilities or flee threshold/);
  assert.match(evidence.sources['tutorial-research-f76c012'].method,/constructor immediately saves needsTutorial=false/);
});

test('cloth roster evidence does not certify seasonal sales or full rendering',()=>{
  const data=catalogue(),evidence=ledger(),id='style:clothing-and-accessory-cloths',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  for(const ref of ['cloths-research-186f2b4','cloths-native-6e8b4e5'])assert(evidence.results[id].evidence.includes(ref));
  assert.equal(evidence.sources['cloths-native-6e8b4e5'].revision,'6e8b4e5d4243de401b16ecc52a4b9b63deffe20e');
  assert.match(feature.audit.expected,/71 pattern pairs \(142 items\)/);
  assert.match(feature.audit.unknowns.join(' '),/seasonal.*120G.*all-class/);
});

test('six native drakes pass without accepting original policy or a seventh egg',()=>{
  const data=catalogue(),evidence=ledger(),id='style:summon-a-drake',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'passed');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.deepEqual(evidence.results[id].evidence,['drakes-research-4006cea','drakes-native-16583cb']);
  assert.match(feature.audit.unknowns.join(' '),/damage attribution.*travel\/disconnect\/death/);
  assert.match(feature.audit.unknowns.join(' '),/Do not infer a seventh egg/);
});

test('Magic Potion consumption passes without accepting deployment or original hue',()=>{
  const data=catalogue(),evidence=ledger(),id='gear:magic-potions',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'passed');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  for(const [ref,kind] of [['magic-potions-research-3389a2c','source'],['magic-potions-regression-62c38f4','regression'],['magic-potions-native-3389a2c','native']]){
    assert.equal(evidence.sources[ref].kind,kind);assert.deepEqual(evidence.sources[ref].checks,[id]);assert(evidence.results[id].evidence.includes(ref));
  }
  assert.equal(evidence.results[id].evidence.length,9);
  assert.match(feature.audit.unknowns.join(' '),/deployment.*unresolved/);assert.match(feature.audit.unknowns.join(' '),/RGB/);
});

test('Mad Lab prepared journeys do not accept unresolved whole-feature semantics',()=>{
  const data=catalogue(),evidence=ledger(),ids=['dungeons:mad-lab','dungeons:mad-lab:ordinary-lab-and-gas','dungeons:mad-lab:coil-secret-and-pool-chain'];
  validateEvidence(data,evidence);
  for(const id of ids){
    const row=records(data).find(r=>r.id===id);
    assert.equal(evidence.results[id].status,'not-run');assert.equal(row.rule.historical,'partial');
    assert.equal(accepted(row.feature,evidence),false);
    for(const ref of ['madlab-verification-source-25a51e6','madlab-room-reward-regression-0e8f429','madlab-room-journey-native-25a51e6'])assert(evidence.results[id].evidence.includes(ref));
  }
  assert.equal(evidence.sources['madlab-room-journey-native-25a51e6'].revision,'25a51e6f7491c055a7303454b7b4c07e2e43c063');
  const completion='madlab-creation-completion-native-35c8a24';
  assert.equal(evidence.sources[completion].revision,'35c8a24ce31affe6eb7320447c79f81817319e6b');
  assert.deepEqual(evidence.sources[completion].checks,[ids[0],ids[2]]);
  assert(!evidence.results[ids[1]].evidence.includes(completion));
  assert.match(data.features.find(f=>f.id===ids[0]).audit.unknowns.join(' '),/cure mask/);
});

test('Worlds1–3 gameplay acceptance preserves history and whole-bank gaps',()=>{
  const data=catalogue(),evidence=ledger(),rows=validateEvidence(data,evidence);
  for(const n of ['01','02','03']){
    const id='realm:map-world-'+n,row=rows.find(r=>r.id===id);
    assert.equal(row.rule.implementation,'present');assert.equal(row.rule.historical,'unreviewed');
    assert.equal(evidence.results[id].status,'passed');
    for(const kind of ['source','regression','native'])assert(evidence.results[id].evidence.some(ref=>ref.startsWith('world01-03-')&&evidence.sources[ref].kind===kind&&evidence.sources[ref].checks.includes(id)));
    assert.match(row.rule.differences.join(' '),/Original identity.*reuse rights remain unverified/);
    if(n!=='01')assert.match(row.rule.acceptance,/Compare the image-guided reconstruction with its source at registered scale and orientation/);
  }
  for(const id of ['realm:realm-generation','realm:map-registration'])assert.equal(evidence.results[id].status,'not-run');
});

test('stable 211 parents and 71 components remain separate from evidence',()=>{
  const data=catalogue(),evidence=ledger(),rows=validateEvidence(data,evidence);
  assert.equal(data.features.length,211);assert.equal(data.categories.length,9);assert.equal(rows.length,282);
  assert.equal(new Set(rows.map(r=>r.id)).size,282);
  assert.equal(rows.filter(r=>r.id!==r.feature.id).length,71);
  assert.equal(rows.filter(r=>r.id.startsWith('realm:map-world-')).length,13);
  assert.equal(digest(data.features.map(f=>f.id)),'d4590c87ab5751a89132a40ed16a37258b5f407ba70d9f5be84724a113b9fa3a');
  assert.equal(digest(rows.filter(r=>r.id!==r.feature.id).map(r=>r.id)),'6c077c8c43e3cc970fa4fa6f3cb0350713c364707bd913c0138f920cf13f1226');
  assert(data.features.every(f=>!accepted(f,evidence)));
  assert(data.features.every(f=>!Object.hasOwn(f,'stage')));
});

test('Chamber receipts preserve partial history and the failed rejected-slot retry',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:oryx-s-chamber',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(accepted(feature,evidence),false);assert.equal(feature.audit.historical,'partial');
  for(const key of [id,id+':oryx-one-phase-and-minion-contract'])assert.equal(evidence.results[key].status,'not-run');
  assert.equal(evidence.results[id+':incantation-unlock-transaction'].status,'failed');
  for(const key of [id,...feature.audit.checks.map(c=>c.id)])assert(evidence.results[key].evidence.includes('chamber-native-partial-2ab46ff'));
  assert.match(evidence.sources['chamber-native-partial-2ab46ff'].limitations,/Neither full case passes/);
  assert.match(feature.audit.checks[1].differences.join(' '),/slot latched/);
});

test('Spider Den egg and column acceptance does not accept every entrance or original history',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:spider-den',component=id+':egg-and-cover-environment',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(evidence.results[component].status,'passed');
  assert.equal(feature.audit.historical,'partial');assert.equal(feature.audit.checks[0].historical,'partial');assert.equal(accepted(feature,evidence),false);
  for(const ref of ['spider-journey-native-57551f0','spider-cover-native-44b376d']){
    assert.equal(evidence.sources[ref].kind,'native');assert.deepEqual(evidence.sources[ref].checks,[id,component]);
    for(const key of [id,component])assert(evidence.results[key].evidence.includes(ref));
  }
  assert.match(evidence.sources['spider-journey-native-57551f0'].limitations,/shared\/denied admission/);
  assert.match(feature.audit.unknowns.join(' '),/boss-exit destination/);
});

test('Ent and Ghost God bounded receipts do not accept original history or acquisition',()=>{
  const data=catalogue(),evidence=ledger();validateEvidence(data,evidence);
  for(const [name,native,regression,research] of [['ent-god','5d43505','5d43505','233f7d8'],['ghost-god','9e258e9','9e258e9','9e258e9']]){
    const id='realm:'+name,feature=data.features.find(f=>f.id===id);
    assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
    for(const [ref,kind] of [[`${name}-native-${native}`,'native'],[`${name}-reward-regression-${regression}`,'regression'],[`${name}-research-${research}`,'source']]){
      assert.equal(evidence.sources[ref].kind,kind);assert.deepEqual(evidence.sources[ref].checks,[id]);assert(evidence.results[id].evidence.includes(ref));
    }
    assert.match(feature.audit.unknowns.join(' '),/multiplayer eligibility, pickup\/reconnect/);
    assert.match(feature.audit.differences.join(' '),/angular-history prediction/);
  }
});

test('Slime God evidence cannot accept original RNG or the whole encounter',()=>{
  const data=catalogue(),evidence=ledger(),id='realm:slime-god',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  for(const [ref,kind] of [['slime-god-native-471824b','native'],['slime-god-reward-regression-ce4394d','regression'],['slime-god-research-fd52882','source']]){
    assert.equal(evidence.sources[ref].kind,kind);assert.deepEqual(evidence.sources[ref].checks,[id]);assert(evidence.results[id].evidence.includes(ref));
  }
  assert.match(feature.audit.differences.join(' '),/Toxic Sewers.*October2016/);
  assert.match(feature.audit.unknowns.join(' '),/prediction\/cooldown/);
});

test('Priest tome receipts do not accept earned progression or original drop rates',()=>{
  const data=catalogue(),evidence=ledger(),id='heroes:priest',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.match(feature.audit.unknowns.join(' '),/rates.*thresholds.*continuity/);
  const sources=evidence.results[id].evidence.map(ref=>evidence.sources[ref]);
  assert.deepEqual(sources.map(s=>s.kind).sort(),['native','native','regression','source','source']);
  assert.match(evidence.sources['priest-purification-native-5346d5a'].limitations,/Sick\/Quiet/);
  for(const source of sources)assert.deepEqual(source.checks,[id]);
});

test('Mystic receipts preserve unresolved acquisition and whole-class acceptance',()=>{
  const data=catalogue(),evidence=ledger(),id='heroes:mystic',feature=data.features.find(f=>f.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.match(feature.audit.expected,/three seconds of immunity/);assert.match(feature.audit.unknowns.join(' '),/Phylactery Bearer.*drop rates|drop rates.*Phylactery Bearer/);
  assert.deepEqual(evidence.results[id].evidence.map(ref=>evidence.sources[ref].kind).sort(),['native','regression','source']);
  for(const ref of evidence.results[id].evidence){assert.deepEqual(evidence.sources[ref].checks,[id]);assert.match(evidence.sources[ref].limitations,/not|Not/);}
});

test('combat receipts keep native projectile checks separate from AOE and history',()=>{
  const data=catalogue(),evidence=ledger(),ids=['realm:shoot-and-take-damage','access:combat-status-feedback','realm:area-damage-feedback'];
  validateEvidence(data,evidence);
  for(const id of ids){
    assert.equal(evidence.results[id].status,'not-run');
    const receipts=evidence.results[id].evidence.filter(ref=>ref.startsWith('combat-')).map(ref=>evidence.sources[ref]);
    assert.deepEqual(receipts.map(source=>source.kind).sort(),id===ids[2]?['regression','source']:['native','regression','source']);
    for(const source of receipts)assert(source.checks.includes(id));
  }
  const feature=data.features.find(f=>f.id===ids[0]);
  assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.match(feature.audit.checks[0].unknowns.join(' '),/Hexed/);
  assert.match(feature.audit.checks[1].unknowns.join(' '),/ACK/);
});

test('client movement trust is intentional policy, not missing restoration or historical sign-off',()=>{
  const data=catalogue(),evidence=ledger(),feature=data.features.find(f=>f.id==='realm:walk-and-dodge');
  validateEvidence(data,evidence);
  assert.match(feature.audit.differences.join(' '),/Intentional project policy: native movement trusts finite, in-bounds client positions/);
  assert.match(feature.audit.differences.join(' '),/not missing restoration work or a confirmed historical deviation/);
  assert.doesNotMatch(feature.audit.expected,/unsafe client trust|server validates/);
  assert.equal(evidence.results[feature.id].status,'not-run');
  for(const ref of ['walk-dodge-source-5ee46b7','walk-dodge-native-5ee46b7','quicksand-native-5ee46b7','walk-dodge-collision-native-59e9f64'])assert(evidence.results[feature.id].evidence.includes(ref));
  assert.match(feature.audit.unknowns.join(' '),/#953/);
  assert.equal(feature.audit.historical,'partial');assert.equal(feature.audit.implementation,'partial');
  assert.equal(accepted(feature,evidence),false);
});

test('Trench coral receipts do not accept whole-dungeon geometry or oxygen',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:ocean-trench';
  const refs=['source','regression','native'].map(kind=>'trench-coral-'+kind+'-e1483e3');
  validateEvidence(data,evidence);
  for(const [i,ref] of refs.entries()){
    assert.equal(evidence.sources[ref].revision,'e1483e36bcd6231e89717f0b2bd38a1fc5e4b0a5');
    assert.equal(evidence.sources[ref].kind,['source','regression','native'][i]);
    assert.deepEqual(evidence.sources[ref].checks,[id]);
    assert.deepEqual(Object.entries(evidence.results).filter(([,r])=>r.evidence.includes(ref)).map(([key])=>key),[id]);
  }
  for(const key of [id,id+':oxygen-route-and-air-pockets',id+':wounded-thessal-response'])assert.equal(evidence.results[key].status,'not-run');
  const feature=data.features.find(f=>f.id===id);
  assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
});

test('Davy ordinary-route pass is separate from crate and historical acceptance',()=>{
  const data=catalogue(),evidence=ledger(),ids=['dungeons:davy-jones-s-locker','dungeons:davy-jones-s-locker:ship-trash-and-objects'];
  const refs=['davy-crates-source-babcc25','davy-crates-regression-babcc25','davy-crates-native-babcc25'];
  validateEvidence(data,evidence);
  for(const [i,ref] of refs.entries()){
    assert.equal(evidence.sources[ref].revision,'babcc25cb22556b655e8ca29536129dda3b3321a');
    assert.equal(evidence.sources[ref].kind,['source','regression','native'][i]);
    assert.deepEqual(evidence.sources[ref].checks,ids);
    assert.deepEqual(Object.entries(evidence.results).filter(([,r])=>r.evidence.includes(ref)).map(([id])=>id),ids);
  }
  assert.equal(evidence.results[ids[0]].status,'passed');assert.equal(evidence.results[ids[1]].status,'not-run');
  const clear='davy-clear-native-479ccff';assert(evidence.results[ids[0]].evidence.includes(clear));
  assert.equal(evidence.sources[clear].kind,'native');assert.equal(evidence.sources[clear].revision,'479ccff0d1dd3be484c4a662ee43949262924926');
  assert.deepEqual(evidence.sources[clear].checks,[ids[0],'dungeons:davy-jones-s-locker:colored-key-door-chain','dungeons:davy-jones-s-locker:lantern-vulnerability-cycle']);
  assert.equal(evidence.results['dungeons:davy-jones-s-locker:lantern-vulnerability-cycle'].status,'passed');
  assert.equal(accepted(data.features.find(f=>f.id===ids[0]),evidence),false);
});

test('Leviathan cadence receipts do not accept the whole encounter',()=>{
  const data=catalogue(),evidence=ledger(),id='realm:leviathan',revision='9f79c958f5cf9a33877692d303ac3793d1ecbda3';
  const refs=['leviathan-cadence-source-9f79c95','leviathan-cadence-regression-9f79c95','leviathan-cadence-native-9f79c95'];
  validateEvidence(data,evidence);
  for(const [i,ref] of refs.entries()){
    assert.equal(evidence.sources[ref].revision,revision);assert.equal(evidence.sources[ref].kind,['source','regression','native'][i]);
    assert.deepEqual(evidence.sources[ref].checks,[id]);assert(evidence.results[id].evidence.includes(ref));
    assert.deepEqual(Object.entries(evidence.results).filter(([,r])=>r.evidence.includes(ref)).map(([key])=>key),[id]);
  }
  const feature=data.features.find(f=>f.id===id);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(feature.audit.historical,'partial');assert.equal(accepted(feature,evidence),false);
  assert.match(evidence.sources[refs[2]].limitations,/prepared island/);
  evidence.results[id]={status:'passed',evidence:[refs[0]]};
  assert.throws(()=>validateEvidence(data,evidence),/without test\/native evidence/);
});

test('Pirate Cave exit evidence stays scoped without accepting the cave',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:pirate-cave',roster='dungeons:pirate-cave:officers-and-cave-roster';
  validateEvidence(data,evidence);assert.equal(evidence.results[id].status,'not-run');assert.equal(evidence.results[roster].status,'passed');
  for(const key of [id,roster])for(const ref of ['pirate-research-fd52882','pirate-journey-native-749847f'])assert(evidence.results[key].evidence.includes(ref));
  assert.deepEqual(evidence.sources['pirate-journey-native-749847f'].checks,[id,roster]);
  assert(evidence.results[id].evidence.includes('pirate-generation-native-c8b4f98'));
  for(const ref of ['pirate-exit-regression-d19287c','pirate-exit-native-d19287c']){
    assert.equal(evidence.sources[ref].revision,'d19287c44d7b2bac88e9b132302c31be431129d9');assert.deepEqual(evidence.sources[ref].checks,[id]);assert(evidence.results[id].evidence.includes(ref));
  }
  for(const ref of ['pirate-exit-regression-f879fb7','pirate-exit-native-f879fb7']){
    assert.equal(evidence.sources[ref].revision,'f879fb781035bd713c6a2f1010275739fe3c57ed');assert.deepEqual(evidence.sources[ref].checks,[id]);assert(evidence.results[id].evidence.includes(ref));
  }
  const feature=data.features.find(f=>f.id===id);assert.equal(accepted(feature,evidence),false);assert.equal(feature.audit.historical,'partial');
  assert(feature.audit.sources.some(s=>s.url==='https://www.youtube.com/watch?v=JMZXtUNZ96s'&&s.label.includes('exact build unverified')));
  assert.match(evidence.sources['pirate-exit-native-d19287c'].limitations,/supporting evidence only/);
  assert.match(evidence.sources['pirate-exit-native-f879fb7'].limitations,/not earned traversal/);
  assert.match(evidence.sources['pirate-exit-regression-f879fb7'].limitations,/not a real death or durable commit/);
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
  const ref='tomb-native-clear-933375f',clear=evidence.sources[ref],bound=Object.entries(evidence.results).filter(([,r])=>r.evidence.includes(ref)).map(([id])=>id);
  assert.equal(clear.kind,'native');assert.equal(clear.revision,'933375f9f3795358f07882da54be84fb3b16c58e');
  assert.deepEqual(bound,clear.checks);assert.deepEqual(bound,[ids[1],ids[4]]);
  assert.match(clear.method,/exact identity\/kind death logs.*one committed Tomb counter.*normal0x704 exit.*same account\/character/);
  assert.match(clear.limitations,/Arena companions were born after objectives and before boss DPS/);
  assert.match(clear.limitations,/not the combined treasure\/individual-loot\/artifact acceptance/);
  for(const name of ['tomb-layout-regression-40d990f','tomb-layout-native-40d990f']){
    const source=evidence.sources[name];assert.equal(source.revision,'40d990f0c2dbbd39577d4e5fcb418a38bd36c76a');
    assert.deepEqual(source.checks,[ids[1],ids[3]]);for(const id of source.checks)assert(evidence.results[id].evidence.includes(name));
  }
  assert.match(evidence.sources['tomb-layout-native-40d990f'].limitations,/regression-only.*not matched seeds/);
  const tomb=data.features.find(f=>f.id===ids[1]);assert(tomb.audit.sources.some(s=>s.url==='https://archive.org/details/youtube-Igu8lFDRHg0'&&s.label.includes('123.4.4')));
  assert.match(tomb.audit.unknowns.join(' '),/Run242 verifies.*PR1043 verifies prepared earned Sphinx-to-Tomb entry.*remain open/);
  assert.deepEqual(evidence.sources['tomb-research-5afc20a'].checks,ids.slice(1));
});

test('Undead endpoint footage keeps scoped evidence and existing acceptance separate',()=>{
  const data=catalogue(),evidence=ledger(),ids=['dungeons:undead-lair','dungeons:undead-lair:entrance-end-dressing'];
  validateEvidence(data,evidence);assert.equal(evidence.results[ids[0]].status,'not-run');assert.equal(evidence.results[ids[1]].status,'passed');
  for(const ref of ['udl-endpoint-regression-3bdaddb','udl-endpoint-native-3bdaddb']){
    const source=evidence.sources[ref];assert.equal(source.revision,'3bdaddb834b37ca671d7a885ea09b9089812c072');assert.deepEqual(source.checks,ids);
    for(const id of ids)assert(evidence.results[id].evidence.includes(ref));
  }
  const feature=data.features.find(f=>f.id===ids[0]);assert.equal(accepted(feature,evidence),false);assert.equal(feature.audit.historical,'partial');
  assert(feature.audit.sources.some(s=>s.url==='https://www.youtube.com/watch?v=SXTEcrN4bII'&&s.label.includes('exact build unverified')));
  assert.match(evidence.sources['udl-endpoint-native-3bdaddb'].limitations,/Not earned traversal or a boss clear/);
});

test('Snake Pit cover and layout evidence does not accept the full route',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:snake-pit:diggable-route-and-cover';
  validateEvidence(data,evidence);
  const row=records(data).find(r=>r.id===id),result=evidence.results[id];
  assert.equal(row.rule.historical,'partial');assert.equal(result.status,'not-run');
  assert.equal(accepted(row.feature,evidence),false);
  const cover=['snake-cover-regression-3778af2','snake-cover-native-3778af2'],layout=['snake-layout-regression-6f35dab','snake-layout-native-6f35dab'];
  const room=['snake-boss-room-source-684eff6','snake-boss-room-regression-684eff6','snake-boss-room-native-b84d963'];
  const treasure=['source','regression','native'].map(kind=>'snake-treasure-layout-'+kind+'-daf0c68');
  const neck=['snake-necks-source-e016a63','snake-necks-regression-e016a63','snake-necks-native-e016a63'];
  const spacing=['snake-cover-spacing-regression-8f490a1','snake-cover-spacing-native-8f490a1'];
  const sight=['native','regression'].map(kind=>'snake-minimap-'+kind+'-544ff3f');
  const width=['source','regression','native'].map(kind=>'snake-width-'+kind+'-4514010');
  const materials=['snake-cover-materials-source-2b28e06','snake-cover-materials-regression-f9ad3e0','snake-cover-materials-native-f9ad3e0'];
  const shape=['source','regression','native'].map(kind=>'snake-cover-shape-'+kind+'-5eec572');
  assert.deepEqual(result.evidence,['snake-research-e16871e',...shape,...materials,...sight,...cover,...layout,...room,...treasure,...neck,...width,...spacing]);
  for(const ref of [...shape,...materials,...sight,...room,...treasure,...neck,...width])assert.deepEqual(evidence.sources[ref].checks,['dungeons:snake-pit',id]);
  for(const ref of shape){assert.equal(evidence.sources[ref].revision,'5eec5726be7b22ce9e50c54f3c9b4f33e247a502');assert(evidence.results['dungeons:snake-pit'].evidence.includes(ref));}
  for(const ref of width){assert.equal(evidence.sources[ref].revision,'4514010b8e35d45a483e50eaa6e4ad66c61bd99c');assert(evidence.results['dungeons:snake-pit'].evidence.includes(ref));}
  for(const ref of sight){assert.equal(evidence.sources[ref].revision,'544ff3f239fef79e531be00919fe3625b38a30d2');assert(evidence.results['dungeons:snake-pit'].evidence.includes(ref));}
  assert.equal(evidence.results['dungeons:snake-pit'].status,'not-run');
  assert.match(evidence.sources[neck[0]].limitations,/not an authenticated exact length formula/);
  assert.match(evidence.sources[neck[1]].limitations,/Not a full224-test-suite pass/);
  assert.equal(evidence.sources[neck[2]].revision,'e016a633d9abafcbdc2e8ed182a8a72e8d1b2840');
  assert.match(evidence.sources[neck[2]].limitations,/not earned entry, actual excavation\/traversal, full clear/);
  const sourceOnly=ledger();sourceOnly.results[id]={status:'passed',evidence:[neck[0]]};
  assert.throws(()=>validateEvidence(data,sourceOnly),/without test\/native evidence/);
  for(const ref of treasure){
    assert.equal(evidence.sources[ref].revision,'daf0c68c870940983cde9dd334acd25be1731e3b');
    assert(evidence.results['dungeons:snake-pit'].evidence.includes(ref));
  }
  assert.match(evidence.sources[treasure[0]].limitations,/inactive test template/);
  assert.match(evidence.sources[treasure[2]].limitations,/not earned entry.*full Snake Pit acceptance/);
  for(const ref of cover){
    assert.equal(evidence.sources[ref].revision,'3778af2b3146d7bc20a504131f1769c01cf005ad');
    assert.deepEqual(evidence.sources[ref].checks,[id]);
  }
  for(const ref of layout){
    assert.equal(evidence.sources[ref].revision,'6f35dab366669aac2a00b75cf3744df0e08bffb8');
    assert.deepEqual(evidence.sources[ref].checks,['dungeons:snake-pit',id]);
    for(const check of evidence.sources[ref].checks)assert(evidence.results[check].evidence.includes(ref));
  }
  assert.match(evidence.sources['snake-layout-native-6f35dab'].limitations,/Not earned entry, entire-corridor excavation, full clear/);
  assert.match(row.rule.unknowns.join(' '),/not the original generator/);
  assert.match(evidence.sources['snake-cover-native-3778af2'].limitations,/not earned.*grate.*minimap/);
});

test('Guardian orbit evidence does not accept the full Snake Pit',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:snake-pit',row=records(data).find(r=>r.id===id);
  validateEvidence(data,evidence);
  assert.equal(evidence.results[id].status,'not-run');assert.equal(row.rule.historical,'partial');assert.equal(accepted(row.feature,evidence),false);
  for(const ref of ['snake-guardians-regression-49335a6','snake-guardians-native-49335a6']){
    assert(evidence.results[id].evidence.includes(ref));assert.equal(evidence.sources[ref].revision,'49335a6d41320ecd1683196093e8290e3f1e5efe');assert.deepEqual(evidence.sources[ref].checks,[id]);
  }
  assert.match(row.rule.unknowns.join(' '),/guardian orbit.*activation/);
  assert.match(evidence.sources['snake-guardians-native-49335a6'].limitations,/not a full Snake Pit clear/);
});

test('Stars hiscores do not accept original Legends or all class-star rules',()=>{
  const data=catalogue(),evidence=ledger();validateEvidence(data,evidence);
  const ids=['heroes:class-stars','heroes:legends-highscores'];
  for(const id of ids){const row=records(data).find(r=>r.id===id);assert.equal(evidence.results[id].status,'not-run');assert.equal(accepted(row.feature,evidence),false);
    for(const ref of ['star-hiscores-api-cc09377','star-hiscores-browser-f7f6c60']){assert(evidence.results[id].evidence.includes(ref));assert.deepEqual(evidence.sources[ref].checks,ids);}}
  assert.equal(evidence.sources['star-hiscores-api-cc09377'].revision,'cc093771d27f1b930ffa08e613021c0698c4c1ca');
  assert.equal(evidence.sources['star-hiscores-browser-f7f6c60'].revision,'f7f6c605aea2f751c3e7df22146a5e1d34f1328e');
});

test('Inventory native verification does not imply historical acceptance',()=>{
  const data=catalogue(),evidence=ledger();validateEvidence(data,evidence);
  const ids=['realm:shoot-and-take-damage','gear:inventory-and-equipment'];
  for(const id of ids){const row=records(data).find(r=>r.id===id);assert.equal(evidence.results[id].status,id===ids[0]?'not-run':'passed');assert.equal(accepted(row.feature,evidence),false);
    for(const ref of ['native-dex-regression-c531740','native-dex-native-e736c05']){assert(evidence.results[id].evidence.includes(ref));assert.deepEqual(evidence.sources[ref].checks,ids);}}
  assert.equal(evidence.sources['native-dex-regression-c531740'].revision,'c531740f75ffc977c55dfaa31bca5b509fc8469b');
  assert.equal(evidence.sources['native-dex-native-e736c05'].revision,'e736c0573a644947566dcd206abac5f23fcd5fa6');
  for(const id of [ids[1],'gear:ability-activation-contract']){assert.equal(evidence.results[id].status,'passed');assert.equal(records(data).find(r=>r.id===id).rule.historical,'partial');}
  for(const [id,ref] of [[ids[1],'inventory-native-c5f52f74'],['gear:ability-activation-contract','ability-contract-native-7a756fca'],['gear:ability-activation-contract','ability-refusals-native-d6caa5d1']])assert(evidence.results[id].evidence.includes(ref));
});

test('Ability cooldown evidence does not accept complete classes',()=>{
  const data=catalogue(),evidence=ledger();validateEvidence(data,evidence);
  for(const [id,ref] of [['heroes:wizard','ability-cooldown-regression-ef5686e'],['heroes:rogue','ability-cooldown-native-ef5686e']]){
    const row=records(data).find(r=>r.id===id);
    assert.equal(evidence.results[id].status,'not-run');assert.equal(accepted(row.feature,evidence),false);
    assert(evidence.results[id].evidence.includes(ref));assert.deepEqual(evidence.sources[ref].checks,[id,'gear:ability-activation-contract']);assert.equal(evidence.sources[ref].revision,'ef5686e5f8e20960d4687e889fcd815d9d9d2eb4');
  }
});

test('Oryx count announcements do not accept complete closure or chat',()=>{
  const data=catalogue(),evidence=ledger(),ids=['realm:realm-closure','social:chat'];
  validateEvidence(data,evidence);
  for(const id of ids){
    const row=records(data).find(r=>r.id===id);
    assert.equal(evidence.results[id].status,'not-run');
    assert.equal(accepted(row.feature,evidence),false);
    assert(evidence.results[id].evidence.includes('oryx-count-regression-41e462f'));
    assert(evidence.results[id].evidence.includes('oryx-count-native-829a4c1'));
  }
  for(const [ref,revision] of [['oryx-count-regression-41e462f','41e462f6fcb58f70a22ceb3447d9270cd63b5614'],['oryx-count-native-829a4c1','829a4c1e0d9afe08e2cb31c59be01667517baf67']]){
    assert.equal(evidence.sources[ref].revision,revision);
    assert.deepEqual(evidence.sources[ref].checks,ids);
  }
  const row=records(data).find(r=>r.id===ids[0]);
  assert.match(row.rule.unknowns.join(' '),/two-minute.*20 seconds.*unverified/);
});

test('protected projectile contrast supports a seam without accepting whole conditions',()=>{
  const data=catalogue(),evidence=ledger(),ids=['condition:22','condition:24','condition:25'],refs=['protected-projectile-source-c4854b8','protected-projectile-native-pair-ef94d41'];
  validateEvidence(data,evidence);
  for(const id of ids){assert.equal(evidence.results[id].status,'not-run');assert.equal(accepted(data.features.find(f=>f.id===id),evidence),false);assert.deepEqual(evidence.results[id].evidence,id==='condition:25'?[...refs,'shield-stun-regression-06b5675','shield-stun-native-545f79e']:refs);}
  for(const ref of refs)assert.deepEqual(evidence.sources[ref].checks,ids);
  const pair=evidence.sources[refs[1]];assert.equal(pair.kind,'native');assert.equal(pair.revision,'ef94d412c8ea470b1f29cb5d2f00592319d95f34');
  assert.equal(pair.url,'https://github.com/OpenRotMG/Open-RotMG-Server/pull/473#issuecomment-6387603081');assert.match(pair.method,/four-line corrective edit/);assert.match(pair.limitations,/not-run/);assert.match(pair.limitations,/not new native journeys/);
});

test('shield stun receipts do not accept complete classes, bosses or conditions',()=>{
  const data=catalogue(),evidence=ledger(),ids=['heroes:knight','realm:ent-ancient','dungeons:undead-lair','condition:7','condition:25'];
  validateEvidence(data,evidence);
  const regression=evidence.sources['shield-stun-regression-06b5675'],native=evidence.sources['shield-stun-native-545f79e'];
  assert.equal(regression.revision,'06b56753fa9919dd36511a5e210fc72933c5da20');assert.deepEqual(regression.checks,ids);
  assert.equal(native.revision,'545f79edd51e718d1efddd975a41d4a2814f6394');assert.deepEqual(native.checks,ids.filter(id=>id!=='realm:ent-ancient'));
  assert.match(native.limitations,/No native Ent acceptance/);
  for(const id of ids){assert.equal(evidence.results[id].status,'not-run');assert.equal(accepted(data.features.find(f=>f.id===id),evidence),false);}
});

test('controls research retains prior passes without accepting the missing chat filter',()=>{
  const data=catalogue(),evidence=ledger(),feature=data.features.find(f=>f.id==='access:controls-and-display');
  validateEvidence(data,evidence);
  assert.equal(feature.audit.implementation,'partial');assert.equal(feature.audit.historical,'partial');
  assert.match(feature.audit.differences.join(' '),/empty cleanText/);
  assert.equal(evidence.results[feature.id].status,'not-run');assert.equal(accepted(feature,evidence),false);
  for(const check of feature.audit.checks){assert.equal(check.historical,'partial');assert.equal(evidence.results[check.id].status,'passed');assert(evidence.results[check.id].evidence.includes('controls-display-research-d15f321'));}
  assert.equal(evidence.sources['controls-display-research-d15f321'].kind,'source');
  assert.equal(evidence.sources['controls-minimap-sight-native-544ff3f'].revision,'544ff3f239fef79e531be00919fe3625b38a30d2');
  const native=evidence.sources['controls-display-native-e4d8ef46'];
  assert.equal(native.kind,'native');assert.deepEqual(native.checks,[feature.id,'social:chat']);
  assert.match(native.method,/13 assertions/);assert.match(native.limitations,/No offensive-language filtering acceptance/);
  for(const id of native.checks){assert.equal(evidence.results[id].status,'not-run');assert(evidence.results[id].evidence.includes('controls-display-native-e4d8ef46'));}
});

test('minimap menu passes only its cross-revision functional scope and preserves prior evidence',()=>{
  const data=catalogue(),evidence=ledger(),id='access:minimap-player-menu',old='minimap-both-invisible-native-9ad87c2';
  validateEvidence(data,evidence);
  const receipts=[
    ['minimap-ordinary-native-d283e22','d283e227da0094f94161e2204e0a281b27b99804','2026-10-21'],
    ['minimap-guild-edge-native-d9f3eb2','d9f3eb27dd8d78a5049cff4b2cecb3a45c6abfed','2026-10-24'],
    ['minimap-guild-pause-native-21b5980','21b5980f2ccd057ddf5f53c10a472d774b6126a8','2026-10-24']
  ];
  assert.deepEqual(evidence.results[id],{status:'passed',evidence:[old,...receipts.map(([ref])=>ref),'controls-display-research-d15f321']});
  for(const [ref,revision,date] of receipts){
    const source=evidence.sources[ref];assert.equal(source.kind,'native');assert.equal(source.revision,revision);assert.equal(source.date,date);
    assert.equal(source.url,'https://github.com/OpenRotMG/Open-RotMG-Server/pull/492#issuecomment-6388142018');assert.deepEqual(source.checks,[id]);
    assert.deepEqual(Object.entries(evidence.results).filter(([,result])=>result.evidence.includes(ref)).map(([check])=>check),[id]);
    assert.match(source.limitations,/cross-revision/);
  }
  assert.match(evidence.sources[receipts[0][0]].limitations,/completed-partial.*not a whole-run pass/);
  assert.match(evidence.sources[receipts[1][0]].limitations,/prepared and unearned/);
  assert.match(evidence.sources[receipts[2][0]].limitations,/not formal Build Storage CI/);
  for(const check of ['social:teleport-to-players','condition:13','condition:22','condition:24','condition:25'])assert.equal(evidence.results[check].status,'not-run');
});

test('work filters use workflow order without implying sequential completion',()=>{
  assert.deepEqual(Object.entries(views),[['work','All unfinished work'],['research','Needs research'],['implementation','Needs implementation'],['verification','Needs verification'],['differences','Known differences'],['accepted','Accepted features'],['all','All features and checks']]);
  const data=catalogue(),evidence=ledger(),sick=records(data).find(r=>r.id==='condition:5');
  assert.deepEqual(sick.rule.differences,[]);
  assert.equal(matches(sick,evidence,'differences'),false);
  assert.equal(matches(sick,evidence,'research'),true);
  assert.equal(accepted(sick.feature,evidence),false);
});

test('present features remain visible for gameplay and historical work',()=>{
  const data=catalogue(),evidence=untestedLedger(),rows=records(data),kage=rows.find(r=>r.id==='realm:kage-kami');
  assert.equal(matches(kage,evidence,'implementation'),false);
  for(const view of ['work','verification','research','all'])assert.equal(matches(kage,evidence,view),true,view);
  assert.equal(matches(kage,evidence,'accepted'),false);
  const recovery=rows.find(r=>r.id==='access:account-recovery');assert.equal(matches(recovery,evidence,'differences'),true);
  assert.equal(matches(rows.find(r=>r.id==='dungeons:mad-lab:coil-secret-and-pool-chain'),evidence,'implementation','TESLA'),true);
  assert.equal(matches(kage,evidence,'all','tesla'),false);
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
  const data=catalogue(),evidence=ledger(),row=records(data).find(r=>r.id==='dungeons:mad-lab');
  assert.equal(row.rule.implementation,'partial');
  for(const view of ['implementation','verification','research','differences'])assert.equal(matches(row,evidence,view),true,view);
  assert.match(row.rule.differences.join(' '),/Tesla Coil.*Horrific Creation/);
  assert.equal(data.features.find(f=>f.id==='dungeons:wine-cellar').audit.checks.find(c=>c.id.endsWith('barrel-destruction')).group,'layout');
});

test('executed acceptance requires an exact ID, revision and test/native receipt',()=>{
  const data=catalogue(),evidence=untestedLedger(),id='heroes:warrior';
  evidence.sources={};for(const result of Object.values(evidence.results))result.evidence=[];
  evidence.results[id]={status:'passed',evidence:[]};assert.throws(()=>validateEvidence(data,evidence),/without test\/native evidence/);
  evidence.sources.test={kind:'source',revision:'a'.repeat(40),date:'2026-10-21',method:'Read the handler',limitations:'No execution',checks:[id],url:'https://github.com/OpenRotMG/Open-RotMG-Server/blob/'+ 'a'.repeat(40)+'/src/world.rs'};
  evidence.results[id].evidence=['test'];assert.throws(()=>validateEvidence(data,evidence),/without test\/native evidence/);
  evidence.sources.test.kind='regression';evidence.sources.test.method='Executed scenario and asserted the saved result';validateEvidence(data,evidence);
  evidence.sources.test.checks=['heroes:wizard'];assert.throws(()=>validateEvidence(data,evidence),/Invalid result binding/);
  evidence.sources.test.checks=[id];evidence.sources.test.revision='main';assert.throws(()=>validateEvidence(data,evidence),/Invalid execution evidence/);
});

test('evidence sources must be bound by every ID they check',()=>{
  const data=catalogue(),evidence=ledger(),id='dungeons:undead-lair',ref='lair-room-space-native-89bc191';
  validateEvidence(data,evidence);evidence.results[id].evidence=evidence.results[id].evidence.filter(r=>r!==ref);
  assert.throws(()=>validateEvidence(data,evidence),new RegExp(`Unbound execution evidence: ${ref}$`));
});

test('missing and orphan results fail explicitly instead of assuming untested',()=>{
  const data=catalogue(),evidence=ledger();delete evidence.results['heroes:rogue'];assert.throws(()=>validateEvidence(data,evidence),/Missing or orphan/);
  evidence.results.unknown={status:'not-run',evidence:[]};assert.throws(()=>validateEvidence(data,evidence),/Missing or orphan/);
});

test('one component pass cannot accept its whole feature or historical rules',()=>{
  const data=catalogue(),evidence=ledger(),f=data.features.find(f=>f.id==='dungeons:manor-of-the-immortals'),id=f.audit.checks[0].id;
  evidence.sources.test={kind:'native',revision:'a'.repeat(40),date:'2026-10-21',method:'Ordinary room journey',limitations:'No historical sign-off',checks:[id],url:'https://github.com/OpenRotMG/Open-RotMG-Website/pull/38'};
  evidence.results[id]={status:'passed',evidence:[...evidence.results[id].evidence,'test']};validateEvidence(data,evidence);
  assert.equal(accepted(f,evidence),false);assert.equal(f.audit.checks[0].historical,'partial');
  for(const rule of [f.audit,...f.audit.checks]){rule.historical='verified';rule.unknowns=[];rule.differences=[];rule.sources=f.audit.sources;}
  assert.equal(accepted(f,evidence),false);
  evidence.sources.test.checks=[f.id,...f.audit.checks.map(c=>c.id)];
  for(const check of evidence.sources.test.checks)evidence.results[check]={status:'passed',evidence:[...new Set([...evidence.results[check].evidence,'test'])]};
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
