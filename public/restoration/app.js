import {implementationLabels,historicalLabels,functionalLabels,provenanceLabels,views,groups,dungeonGates,checks,validateEvidence,matches,workCounts,accepted,current} from './catalogue.js';

export async function mountCatalogue(document,fetch,window,logger=console) {
  const $=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const link=(label,url)=>{const a=el('a',label);a.href=url;return a;};
  const list=items=>{const n=el('ul');for(const item of items)n.append(el('li',item));return n;};
  const section=(title,body)=>{const n=el('section');n.append(el('h3',title),typeof body==='string'?el('p',body):body);return n;};
  const dialog=$('feature-dialog');
  const error=exception=>{if(dialog.open)dialog.close();$('error').hidden=false;$('error').textContent=`Cannot load restoration: ${exception.message}`;logger.error(exception);};
  const close=()=>{dialog.close();const h=new URLSearchParams(window.location.hash.slice(1));if(h.has('feature')||h.has('check'))window.history.replaceState(null,'',window.location.pathname+window.location.search);};
  $('feature-close').addEventListener('click',close);
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))close();});
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  $('search-form').addEventListener('submit',e=>e.preventDefault());
  try {
    const load=async file=>{const response=await fetch(file);if(!response.ok)throw new Error(`${file}: HTTP ${response.status}`);return response.json();};
    const [data,evidence]=await Promise.all([load('progress.json'),load('evidence.json')]);
    const all=validateEvidence(data,evidence),byId=new Map(all.map(r=>[r.id,r])),componentCount=all.length-data.features.length,migration=evidence.migration,reviewed=migration.reviewedRevision.slice(0,7);
    $('migration').textContent=`Reviewed server ${reviewed} · Case head ${migration.revision.slice(0,7)} · Runtime ${migration.runtimeRevision.slice(0,7)}. ${migration.qualification}`;$('migration').hidden=false;
    const icon=path=>{const n=el('img');n.src=path;n.alt='';n.className='sprite';return n;};
    const scopes={earned:'Earned milestones',prepared:'Prepared start',protected:'Protected combat'};
    const captureLabel=b=>b.disposition==='carry-only' ? `Earlier capture ${b.binarySha256.slice(0,8)}; scope-reviewed carry` : b.scopeSha256===migration.scopeSha256 ? 'Final executable' : 'Capture on the then-target executable';
    const gameplay=(id,result)=>{
      const bindings=result.evidence.filter(ref=>current(evidence,ref)).map(ref=>evidence.sources[ref].binding).filter(b=>b?.passes.includes(id));
      if(result.status!=='passed'||!bindings.length)return functionalLabels[result.status]+(result.prior?` (prior engine: ${functionalLabels[result.prior]})`:'');
      return `Passed (${[...new Set(bindings.map(captureLabel))].join(' + ')}) · ${[...new Set(bindings.map(b=>scopes[b.scope]))].join(' / ')}`;
    };
    const state=row=>{const n=el('span',undefined,'audit-state'),result=evidence.results[row.id];
      n.append(el('span',implementationLabels[row.rule.implementation],`implementation-${row.rule.implementation}`),el('span',`Gameplay: ${gameplay(row.id,result)}`,`functional-${result.status}`),el('span',`History: ${historicalLabels[row.rule.historical]}`,`historical-${row.rule.historical}`));return n;};
    const historicalSources=sources=>{const n=el('div');for(const source of sources){const p=el('p',undefined,'citation');p.append(el('strong',source.label+': '),link(source.url,source.url));if(source.qualification)p.append(el('br'),el('span','Preserved artifact qualification: '+source.qualification));n.append(p);}return n;};
    function appendEvidence(node,refs,id) {
      for(const ref of refs){const s=evidence.sources[ref],p=el('p',undefined,'citation'),b=s.binding;
        p.append(el('strong',`${b?`${scopes[b.scope]} · ${captureLabel(b)}`:s.kind} · ${s.date} · captured at ${s.revision}${s.fingerprint?` · runtime inputs ${s.fingerprint}`:''}`),el('br'),link(s.url,s.url),el('br'),el('span',s.method),el('br'),el('span','Limits: '+(b?`${b.limits[id]} ${s.limitations}`:s.limitations)));
        if(b){const details=el('details');details.append(el('summary','Receipt identifiers'),el('p',`${b.basis}. Job: ${b.job} · Case SHA-256: ${b.caseSha256} · Dependency SHA-256: ${b.dependencyFingerprint} · Package SHA-256: ${b.packageSha256}${b.caseOverlaySha256?` · Case overlay SHA-256: ${b.caseOverlaySha256}`:""} · Executable SHA-256: ${b.binarySha256}${b.disposition==='carry-only'?` · Executable scope SHA-256: ${b.scopeSha256}`:""}`));p.append(details);}
        node.append(p);}
    }
    function functionalProof(id) {
      const result=evidence.results[id],n=el('div'),refs=result.evidence.filter(ref=>evidence.sources[ref].kind!=='source'),fresh=refs.filter(ref=>current(evidence,ref)),older=refs.filter(ref=>!fresh.includes(ref));
      n.append(el('p',gameplay(id,result)));
      if(!refs.length)n.append(el('p','No executed acceptance result is bound to this ID. This does not assert that no prior testing exists.'));
      if(fresh.length){n.append(el('h4',`Evidence for reviewed server ${reviewed}${result.status==='not-run'?' (partial observations; check still pending)':''}`));appendEvidence(n,fresh,id);}
      if(older.length){const archive=el('div');appendEvidence(archive,older,id);n.append(priorEngine(`Earlier server receipts${result.prior?` (prior-engine result: ${functionalLabels[result.prior].toLowerCase()})`:''}. Not acceptance for ${reviewed}.`,archive));}
      return n;
    }
    function runtimeSources(facts) {
      const n=el('div');n.append(el('p',`Source facts at the cited server revisions. These include recovered XML and project-authored changes; they are not gameplay results.`));
      for(const f of facts){const p=el('p',undefined,'citation');p.append(el('strong',provenanceLabels[f.provenance]+': '),el('span',f.fact),el('br'),link(f.url,f.url));if(f.artifact)p.append(el('br'),link(f.artifact,f.artifact));n.append(p);}
      return n;
    }
    function priorEngine(title,body) {
      const details=el('details',undefined,'prior-engine');
      details.append(el('summary',title),body);
      return details;
    }
    function openRecord(row) {
      const f=row.feature,r=row.rule,component=row.id!==f.id;
      $('feature-title').textContent=component?`${f.name}: ${r.name}`:f.name;
      $('feature-icon').hidden=!f.icon;if(f.icon)$('feature-icon').src=f.icon;else $('feature-icon').removeAttribute('src');
      $('feature-status').replaceChildren(state(row));
      const content=[];
      if(r.runtime)content.push(section('Candidate runtime sources',runtimeSources(r.runtime)));
      content.push(section('Historical target / requirement',r.expected));
      if(component)content.push(section('Observable acceptance check',r.acceptance));
      else if(f.category==='dungeons')content.push(section('Whole-dungeon acceptance',list(Object.entries(dungeonGates).map(([key,text])=>`${groups[key]}: ${text}`))));
      if(r.differences.length)content.push(section('Known / intentional differences',list(r.differences)));
      content.push(section('Historical research',r.unknowns.length?list(r.unknowns):r.historical==='unreviewed'?'This component has no independent historical sign-off. Parent questions and source qualifications still apply.':'No additional local questions recorded; this is not automatic historical acceptance.'));
      if(component&&f.audit.unknowns.length)content.push(section('Parent historical questions',list(f.audit.unknowns)));
      if(r.priorEngine?.length)content.push(priorEngine('Prior-engine history',list(r.priorEngine)));
      if(r.sources.length)content.push(section('Historical references',historicalSources(r.sources)));
      if(component)content.push(section('Parent research leads (not component sign-off)',historicalSources(f.audit.sources)));
      content.push(section('Recorded gameplay acceptance',functionalProof(row.id)));
      const review=evidence.sourceReview,source=el('div');source.append(el('p',`Last whole-catalogue source audit: server ${review.revision.slice(0,7)}, ${review.date}. ${review.qualification}`),link(review.url,review.url));appendEvidence(source,evidence.results[row.id].evidence.filter(ref=>evidence.sources[ref].kind==='source'));content.push(priorEngine('Earlier implementation reviews',source));
      content.push(section('Update this check',`For restoration-related PRs, identify ${row.id} in the PR comment. When source support changes, update this row's implementation and differences in progress.json. Bind executed evidence to that ID in the evidence ledger. Include tested revision, date, method, result and limitations. Gameplay results need pinned native observations and matching check dependencies for reviewed server ${reviewed}. Source inspection cannot pass gameplay acceptance; a merged PR cannot establish historical accuracy.`));
      content.push(section('Stable check identity',link(row.id,`#${component?'check':'feature'}=${encodeURIComponent(row.id)}`)));
      if(!component)content.push(section('Feature completion',accepted(f,evidence)?'All recorded requirements and acceptance checks are satisfied.':'Not accepted. The parent and every component need source support, recorded gameplay acceptance and historical sign-off without unresolved questions or differences.'));
      $('feature-audit').replaceChildren(...content);if(!dialog.open)dialog.showModal();
    }
    function recordLink(row,cls) {
      const component=row.id!==row.feature.id,a=link(component?row.rule.name:row.feature.name,`#${component?'check':'feature'}=${encodeURIComponent(row.id)}`);a.className=cls;
      a.dataset[component?'check':'feature']=row.id;
      if(!component&&row.feature.icon){a.prepend(icon(row.feature.icon));if(row.feature.category==='conditions')a.firstChild.classList.add('condition-icon');}
      if(!component&&row.id==='dungeons:oryx-s-chamber')a.append(el('small','Oryx 1'));
      if(!component&&row.id==='dungeons:wine-cellar')a.append(el('small','Oryx 2'));
      return a;
    }
    function featureRow(f,visible) {
      const li=el('li'),parent=byId.get(f.id),body=el('div');body.append(recordLink(parent,'feature'));
      if(f.audit.differences.length)body.append(el('p',f.audit.differences[0],'work-note'));
      const children=checks(f);if(children.length)body.append(el('p',`Needs research: ${children.filter(c=>c.historical!=='verified').length} → Needs implementation: ${children.filter(c=>c.implementation!=='present').length} → Needs verification: ${children.filter(c=>evidence.results[c.id].status!=='passed').length}`,'work-note'));
      const components=children.filter(c=>visible.some(r=>r.id===c.id));
      const sections=f.category==='dungeons'?Object.keys(dungeonGates):[...new Set(components.map(c=>c.group))];
      for(const key of sections){const members=components.filter(c=>c.group===key);if(!members.length&&$('search').value)continue;const details=el('details',undefined,'component-group');
        const heading=el('summary',`${groups[key]}${members.length?' ('+members.length+')':''}`);details.append(heading);
        if(f.category==='dungeons')details.append(el('p',dungeonGates[key],'work-note'));
        const ul=el('ul',undefined,'check-list');
        for(const c of members){const item=el('li'),row=byId.get(c.id);item.append(recordLink(row,'check'),state(row));ul.append(item);}
        if(members.length)details.append(ul);else details.append(el('p','Required as part of whole-dungeon acceptance; no matching separate component in this view.','work-note'));
        body.append(details);
      }
      li.append(body,state(parent));return li;
    }
    function render() {
      const view=$('view').value,query=$('search').value,category=$('category').value;
      const visible=all.filter(r=>(!category||r.feature.category===category)&&matches(r,evidence,view,query));
      const featureIds=new Set(visible.map(r=>r.feature.id));
      $('visible-count').textContent=`${featureIds.size} / ${data.features.length} feature groups; ${visible.filter(r=>r.id!==r.feature.id).length} / ${componentCount} component checks match. Counts are separate, not completion points.`;
      $('features').replaceChildren();
      for(const area of data.categories){const features=data.features.filter(f=>f.category===area.id&&featureIds.has(f.id));if(!features.length)continue;
        const d=el('details',undefined,'category');d.id=area.id;d.open=!!query||!!category;
        d.append(el('summary',`${area.name} (${features.length})`));
        const ul=el('ul',undefined,'forum-list');for(const f of features)ul.append(featureRow(f,visible));d.append(ul);
        if(area.unknowns?.length)d.append(section('Area historical questions',list(area.unknowns.map(q=>q.question))));
        $('features').append(d);
      }
      if(!visible.length)$('features').append(el('p','No matching requirements. Change the search or work type.'));
    }
    function roadmap() {
      $('roadmap').replaceChildren();
      for(const area of data.categories){const fs=data.features.filter(f=>f.category===area.id),stats=workCounts(fs,evidence),card=el('article',undefined,'roadmap-area');
        const title=el('h3');title.append(icon(area.icon),el('span',area.name));card.append(title,el('p',area.summary));
        card.append(el('p',`Needs research: ${stats.research} → Needs implementation: ${stats.implementation} → Needs verification: ${stats.verification} | Known differences: ${stats.differences}`,'area-counts'));
        const gaps=fs.flatMap(f=>f.audit.differences.map(text=>`${f.name}: ${text}`));
        if(gaps.length)card.append(section('Recorded differences',list(gaps.slice(0,2))));
        else card.append(el('p','No known implementation differences are recorded here. This does not establish completed verification.','work-note'));
        const next=all.filter(r=>r.feature.category===area.id&&matches(r,evidence,'implementation')).slice(0,3);
        if(next.length)card.append(section('Implementation checks to investigate',list(next.map(r=>r.id===r.feature.id?r.feature.name:r.rule.name))));
        const research=fs.flatMap(f=>f.audit.unknowns);if(research.length){const detail=el('details',undefined,'research-preview');detail.append(el('summary','Next historical research'),el('p',research[0]));card.append(detail);}
        const action=link('Open requirements','#area='+area.id);card.append(action);$('roadmap').append(card);
      }
    }
    function followHash() {
      const hash=window.location.hash.slice(1),params=new URLSearchParams(hash);
      if(params.has('check')||params.has('feature')){const key=params.has('check')?'check':'feature',row=byId.get(params.get(key));if(!row||(key==='check')===(row.id===row.feature.id))throw new Error(`Unknown ${key} link: ${params.get(key)}`);openRecord(row);return;}
      if(dialog.open)dialog.close();
      const area=params.has('area')?params.get('area'):hash;
      if(area){if(!data.categories.some(c=>c.id===area))throw new Error(`Unknown area link: ${area}`);$('category').value=area;$('view').value='all';$('search').value='';render();const node=$(area);node.open=true;node.scrollIntoView();}
    }
    for(const [value,label]of Object.entries(views)){const option=el('option',label);option.value=value;$('view').append(option);}
    for(const c of data.categories){const option=el('option',c.name);option.value=c.id;$('category').append(option);}
    for(const id of ['view','category','search'])$(id).addEventListener(id==='search'?'input':'change',render);
    $('clear').addEventListener('click',()=>{$('view').value='work';$('category').value='';$('search').value='';render();});
    window.addEventListener('hashchange',()=>{try{$('error').hidden=true;followHash();}catch(e){error(e);}});
    roadmap();render();followHash();$('filters').disabled=false;
    return {data,evidence,render,openRecord};
  }catch(exception){$('roadmap').replaceChildren();$('features').replaceChildren();error(exception);return null;}
}
if(typeof document!=='undefined')mountCatalogue(document,fetch,window);
