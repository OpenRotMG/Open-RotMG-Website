import { percentage as percent, validateCatalogue } from './catalogue.js';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const image=url=>{const n=el('img',undefined,'sprite');n.src=url;n.alt='';return n;};
const dialog=$('feature-dialog');
$('feature-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close();});
function openFeature(f){
  $('feature-title').textContent=f.name;$('feature-criterion').textContent=f.criterion;
  $('feature-criterion').hidden=f.requirements!==undefined&&f.requirements.length>0;
  $('feature-icon').hidden=!f.icon;if(f.icon)$('feature-icon').src=f.icon;else $('feature-icon').removeAttribute('src');
  $('development-note').hidden=!f.development;
  $('feature-gates').replaceChildren(...['Original rules','Recreation'].map((name,i)=>{
    const row=el('div',undefined,'gate');row.dataset.verified=String(f.stage>i);
    row.append(el('span',name),el('strong',f.stage>i?'Verified':'Not verified',f.stage>i?'passed':''));return row;
  }));
  $('feature-requirements').replaceChildren(...(f.requirements===undefined?[]:f.requirements).map(text=>el('li',text)));
  const proof=$('feature-proof');proof.replaceChildren();
  if(f.evidence){
    proof.append(el('p',f.evidence.reference));
    if(f.evidence.verification)proof.append(el('p',f.evidence.verification));
    for(const url of f.evidence.links){const a=el('a',url);a.href=url;proof.append(a);}
  }
  dialog.showModal();
}
function tile(f){
  const b=el('button',undefined,'feature'+(f.stage===2?' complete':f.stage===1?' referenced':'')+(f.development?' development':''));
  b.dataset.feature=f.id;b.type='button';b.title=`${f.name}: ${f.stage*50}% restoration${f.development?' · development scene':''}`;
  if(f.icon){const icon=image(f.icon);if(f.category==='conditions')icon.classList.add('condition-icon');b.append(icon);}
  const name=el('span',f.name);
  if(f.name==='Oryx’s Chamber')name.append(el('small','Oryx 1'));
  if(f.name==='Wine Cellar')name.append(el('small','Oryx 2'));
  b.append(name);
  if(f.stage===2)b.append(el('span','✓','check'));
  b.addEventListener('click',()=>openFeature(f));return b;
}
(async()=>{
  try{
    const response=await fetch('progress.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const { e, v, n } = validateCatalogue(data);
    $('overall').textContent=percent(data.features);
    $('overall').setAttribute('aria-label',`${percent(data.features)} on the provisional ${n}-feature catalogue; open source data`);
    $('ring-progress').style.strokeDasharray=`${100*(e+v)/(2*n)} 100`;
    for(const c of data.categories){
      const rows=data.features.filter(f=>f.category===c.id);
      const area=el('a',undefined,'area');area.href='#'+c.id;area.dataset.area=c.id;
      area.append(image(c.icon),el('span',c.name),el('strong',percent(rows)));
      const section=el('details',undefined,'category');section.id=c.id;section.open=['heroes','access','conditions','dungeons'].includes(c.id);
      const summary=el('summary');summary.append(el('h2',c.name));
      const grid=el('div',undefined,'feature-grid');grid.append(...rows.map(tile));section.append(summary,grid);
      area.addEventListener('click',()=>{section.open=true;});
      $('areas').append(area);$('features').append(section);
    }
  }catch(error){$('overall').textContent='Error';$('error').hidden=false;$('error').textContent=`Cannot load restoration: ${error.message}`;console.error(error);}
})();
