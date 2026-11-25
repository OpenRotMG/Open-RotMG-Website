import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const digest = value => createHash('sha256').update(value).digest('hex');

test('production closure fingerprints follow spawned children and transitive portal destinations, not unrelated data', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'restoration-dependencies-'));
  t.after(() => rmSync(dir, {recursive:true, force:true}));
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], {encoding:'utf8'}).trim();
  git('init', '-q');
  const file = 'examples/testing/arena.mjs', prefix = 'game/123.5.1/';
  const base = {
    [prefix+'game.xml']: '<Game schema="1"><Include file="actors.xml"/><Geometry file="geometry.xml"/><World id="arena" map="arena"/><World id="nexus" map="nexus"/><World id="chamber" map="chamber"/><World id="unrelated" map="chamber"/></Game>',
    [prefix+'actors.xml']: '<Objects><Object type="0x100" id="Parent"/><Object type="0x101" id="Child"><XpMult>1</XpMult></Object><Object type="0x102" id="Unrelated"><XpMult>2</XpMult></Object><Object type="0x103" id="Exit"/><Object type="0x104" id="Next Exit"/></Objects>',
    [prefix+'geometry.xml']: '<Geometry><Template id="arena"/><Template id="nexus"/><Template id="nexus-alt"/><Template id="chamber"/><Template id="chamber-alt"/></Geometry>',
    'grounds.xml': '<Grounds/>'
  };
  const reportPath = join(dir, 'closure.json');
  const write = (path, text) => { mkdirSync(dirname(join(dir,path)), {recursive:true});writeFileSync(join(dir,path),text); };
  write(file, "export const fixture={world:'arena'};\nexport const act=p=>p.use(p.nearest());\n");
  function snapshot(changes={}){
    const files={...base,...changes};
    for(const [path,bytes] of Object.entries(files))write('data/'+path,bytes);
    git('add','data','examples');git('-c','user.name=Test','-c','user.email=test@example.test','commit','-qm','scenario data');
    const inputs=Object.fromEntries(Object.keys(files).sort().map(file=>[file,digest(files[file])]));
    const fingerprint=digest(JSON.stringify([1,inputs])), revision=git('rev-parse','HEAD');
    write('closure.json',JSON.stringify({fingerprint,inputs,
      properties:{256:{name:'Parent'},257:{name:'Child'},258:{name:'Unrelated'},259:{name:'Exit'},260:{name:'Next Exit'}},
      definitions:{256:{dependencies:[257,259]}},property_dependencies:{256:[],257:[],258:[],259:[],260:[]},
      maps:Object.entries({arena:[256],nexus:[260],'nexus-alt':[260],chamber:[],'chamber-alt':[]})
        .map(([name,objects])=>({name,objects,geometry:{Template:{}}})),
    }));
    return {revision,fingerprint};
  }
  function proof(target,captured=target){
    const env={variant:{},runtime:{}};
    return JSON.parse(execFileSync('python3',[fileURLToPath(new URL('./restoration-dependencies.py',import.meta.url)),dir,reportPath],
      {input:JSON.stringify([target.revision,target.fingerprint,[['arena',file,env,captured.revision,captured.fingerprint]]])})).arena;
  }
  const original=snapshot(), [initial]=proof(original);
  const changed=snapshot({[prefix+'actors.xml']:base[prefix+'actors.xml'].replace('>1<','>3<')});
  assert.notEqual(proof(changed)[0],initial);
  const routes='<PortalRoute object="Exit" from="arena" destination="nexus"/>' +
    '<PortalRoute object="Exit" from="unrelated" destination="nexus"/>';
  const game=prefix+'game.xml', manifest=base[game].replace('</Game>',`${routes}</Game>`)
    .replace('<World id="chamber" map="chamber"/>','<World id="chamber" map="chamber"><Instance entrance="Next Exit" name="Chamber"/><Clear boss="Parent" route="none"/></World>');
  const routed=snapshot({[game]:manifest});
  const [withRoute, beforeRoute]=proof(routed,original);
  assert.equal(beforeRoute,initial);
  assert.notEqual(withRoute,initial);
  for (const [world,label] of [
    ['nexus','keyword-free interaction reaches its contextual PortalRoute destination'],
    ['chamber','a reached map links another destination via World/Instance entrance'],
  ]) await t.test(label, () => {
    const moved=snapshot({[game]:manifest.replace(`id="${world}" map="${world}"`, `id="${world}" map="${world}-alt"`)});
    const [target,captured]=proof(moved,routed);
    assert.equal(captured,withRoute);
    assert.notEqual(target,captured,`${world} destination map must affect the case digest`);
  });
  const geometry=prefix+'geometry.xml';
  const reshaped=snapshot({[game]:manifest, [geometry]:base[geometry].replace('id="chamber"', 'id="chamber" width="2"')});
  assert.notEqual(proof(reshaped)[0],withRoute,'a destination map definition must be in the closure');
  await t.test('an unrelated actor and a World sharing the route kind do not invalidate the cohort', () => {
    const unrelated=snapshot({[game]:manifest, [prefix+'actors.xml']:base[prefix+'actors.xml'].replace('>2<','>3<')});
    assert.notEqual(unrelated.fingerprint,routed.fingerprint);
    assert.equal(proof(unrelated)[0],withRoute);
    const movedUnrelated=snapshot({[game]:manifest.replace('id="unrelated" map="chamber"', 'id="unrelated" map="chamber-alt"')});
    assert.notEqual(movedUnrelated.fingerprint,routed.fingerprint);
    assert.deepEqual(proof(movedUnrelated,routed),[withRoute,withRoute]);
  });

  for (const field of ['opened','retire']) {
    const world = field === 'opened'
      ? '<Unlock item="Child" locked="Exit" opened="Unrelated"/>'
      : '<Clear boss="Parent" route="none" retire="Unrelated"/>';
    const typed = manifest.replace('<World id="arena" map="arena"/>',`<World id="arena" map="arena">${world}</World>`);
    const linked=snapshot({[game]:typed}), [linkedHash]=proof(linked);
    const modified=snapshot({[game]:typed, [prefix+'actors.xml']:base[prefix+'actors.xml'].replace('>2<','>3<')});
    assert.notEqual(proof(modified)[0],linkedHash,`${field} must bind the referenced object definition`);
  }
  const outside=snapshot({[game]:manifest.replace('destination="nexus"','destination="unclassified"')});
  assert.throws(()=>proof(outside),/Unclassified PortalRoute destination: unclassified/);
});
