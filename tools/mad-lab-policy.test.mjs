import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEvidence,accepted} from '../public/restoration/catalogue.js';

const load=name=>JSON.parse(readFileSync(new URL('../public/restoration/'+name,import.meta.url),'utf8'));
test('Mad Lab ten-percent balance policy does not promote history or whole-feature acceptance',()=>{
  const data=load('progress.json'),evidence=load('evidence.json');validateEvidence(data,evidence);
  for(const id of ['realm:flying-brain','dungeons:mad-lab']){
    const feature=data.features.find(f=>f.id===id);
    assert.equal(feature.audit.historical,'partial');assert.equal(evidence.results[id].status,'not-run');assert.equal(accepted(feature,evidence),false);
    assert.match(feature.audit.differences.join(' '),/new project balance policy, not an authenticated123\.5\.1 rate/);
    for(const ref of ['madlab-rate-policy-source-697bc662','madlab-rate-policy-regression-697bc662']){
      assert(evidence.results[id].evidence.includes(ref));assert.equal(evidence.sources[ref].revision,'697bc6621e48534674b808c8d75fc0ac68e24700');
    }
  }
});
