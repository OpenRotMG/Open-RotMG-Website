const sourceLabels={research:'Existing feature research (version qualifications apply)',general:'General loot and allocation research, not enemy-specific odds',period:'Archived period wiki (version coverage varies)',kithio:'Compiled Kithio comparison, not official backend data',trapped:'Retired Trapped provenance, not an approved authority',realmsrc:'Modified 7.0 comparison, not a 123.5.1 specification',fsod:'Later FSoD comparison, not a 123.5.1 specification'};
export function rowsFor(data){
  if(!data||!Array.isArray(data.groups)||!Array.isArray(data.items)||(data.revision!==null&&!/^[a-f0-9]{40}$/.test(data.revision)))throw Error('Malformed loot catalogue');
  const items=new Map(data.items.map(item=>[item.id,item])),rows=[];
  for(const group of data.groups){
    if(!['independent','per_item','ordered','capped'].includes(group.mode)||!group.eligibility||!group.allocation)throw Error('Missing loot rules');
    let survival=1,distribution=[1,0,0,0,0,0,0,0,0];
    for(const [index,entry] of group.entries.entries()){
      if(!Number.isFinite(entry.probability)||entry.probability<0||entry.probability>1||!entry.items.length)throw Error('Invalid loot probability');
      const p=entry.probability/entry.items.length;
      for(const id of entry.items){
        const item=items.get(id);if(!item)throw Error('Unknown loot item '+id);
        let chance=group.mode==='ordered'?survival*p:p;
        if(group.mode==='capped'){
          chance=p*[3,4,5,6,7].reduce((sum,cap)=>sum+distribution.slice(0,cap).reduce((a,b)=>a+b,0),0)/5;
          const next=Array(9).fill(0);for(let n=0;n<9;n++){next[n]+=distribution[n]*(1-p);next[Math.min(8,n+1)]+=distribution[n]*p;}distribution=next;
        }
        rows.push({item,group,chance,index,balance:entry.balance,note:entry.note});
      }
      survival*=1-entry.probability;
    }
  }
  return rows.sort((a,b)=>a.item.name.localeCompare(b.item.name)||a.group.enemy.name.localeCompare(b.group.enemy.name)||a.index-b.index);
}
export function selectRows(rows,query,category){
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(row=>words.every(word=>(row.item.name+' '+row.group.enemy.name).toLowerCase().includes(word))&&(category==='all'||category==='unique'&&row.item.tier===null&&row.item.slot>0&&row.item.slot!==10||category==='rare'&&row.chance>0&&row.chance<.01-1e-12||category==='balance'&&row.balance));
}
export function odds(chance){return chance===0?['0%','Blocked by earlier rewards']:[new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(chance*100)+'%',chance===1?'Guaranteed on this attempt':'1 in '+new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(1/chance)];}
async function json(url){const response=await fetch(url,{cache:'no-store',redirect:'error'});if(!response.ok)throw Error('Drop catalogue request failed ('+response.status+')');return response.json();}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function sourceLink(url,label){const a=element('a',label);a.href=url;return a;}
async function mount(){
  const status=document.querySelector('#status'),error=document.querySelector('#error'),catalogue=document.querySelector('#catalogue');
  try{
    if(!globalThis.OpenRotMGBackend)throw Error('Game backend configuration is missing');
    const [data,sources,art]=await Promise.all([json(OpenRotMGBackend.url('/api/drop-rates')),json('sources.json'),json('../hiscores/items.json')]);
    if(!Array.isArray(sources))throw Error('Malformed source index');
    for(const source of sources){if(!Object.hasOwn(sourceLabels,source.type)||!Array.isArray(source.enemies)||!/^https:\/\//.test(source.url))throw Error('Invalid research source');}
    const rows=rowsFor(data),sprites=new Map(art.map(item=>[item.id,item]));
    for(const row of rows)if(!sprites.has(row.item.id))throw Error('Missing selected-client sprite: '+row.item.name);
    status.textContent=data.revision?'Live server '+data.revision.slice(0,12)+' · '+rows.length.toLocaleString()+' reward entries':'Local, unversioned server build · '+rows.length.toLocaleString()+' reward entries';
    const search=document.querySelector('#search'),category=document.querySelector('#category'),target=document.querySelector('#drops');let page=0;
    search.value=new URLSearchParams(location.search).get('q')??'';
    function render(){
      const filtered=selectRows(rows,search.value,category.value),pages=Math.max(1,Math.ceil(filtered.length/100));page=Math.min(page,pages-1);target.replaceChildren();
      document.querySelector('#count').textContent=filtered.length.toLocaleString()+' matching reward entries';
      for(const row of filtered.slice(page*100,(page+1)*100)){
        const card=element('article',undefined,'drop'),head=element('div',undefined,'drop-head'),icon=element('span',undefined,'item-icon'),sprite=sprites.get(row.item.id);icon.style.backgroundPosition=`${-sprite.x*2}px ${-sprite.y*2}px`;icon.setAttribute('aria-hidden','true');
        const title=element('div'),name=element('h2',row.item.name);title.append(name,element('p',row.group.enemy.name+' · '+row.group.channel,'enemy'));
        if(row.balance)title.append(element('span','Owner-selected balance','badge'));
        const [percent,oneIn]=odds(row.chance),chance=element('div',percent,'chance');chance.append(element('small',oneIn));head.append(icon,title,chance);
        const rules=element('p',row.group.eligibility+' '+row.group.allocation+(row.note?' '+row.note:''),'rules');
        const details=element('details',undefined,'sources'),list=element('ul');details.append(element('summary','Rules & sources'));
        const rule=element('li',`Roll ${row.index+1}: ${row.group.mode.replace('_',' ')}; ${row.group.entries[row.index].items.length} candidate item(s).`);list.append(rule);
        if(data.revision){for(const file of [...new Set([row.group.source_file,'src/loot.rs',row.group.rules_file])]){const li=element('li');li.append(sourceLink(`https://github.com/OpenRotMG/Open-RotMG-Server/blob/${data.revision}/${file}`,'Current implementation: '+file));list.append(li);}}
        else list.append(element('li','Local source files: '+row.group.source_file+' and '+row.group.rules_file+'. No deployed revision is available.'));
        const evidence=sources.filter(source=>source.enemies.includes(row.group.enemy.id));
        for(const source of evidence){const li=element('li',sourceLabels[source.type]);li.append(sourceLink(source.url,source.url));list.append(li);}
        details.append(element('p',row.balance?'This rate is a selected balance change, not a confirmed historical probability.':'Historical rate unverified. References may support item membership or mechanics without establishing these exact odds.'));
        if(!evidence.some(source=>['period','kithio','research'].includes(source.type)))details.append(element('p','No enemy-specific period or primary reference is recorded. Historical odds remain unverified.'));
        details.append(list);card.append(head,rules,details);target.append(card);
      }
      document.querySelector('#page').textContent=`Page ${page+1} of ${pages}`;document.querySelector('#previous').disabled=page===0;document.querySelector('#next').disabled=page===pages-1;
    }
    for(const node of [search,category])node.addEventListener('input',()=>{page=0;render();});
    document.querySelector('#previous').addEventListener('click',()=>{page--;render();});document.querySelector('#next').addEventListener('click',()=>{page++;render();});
    catalogue.hidden=false;render();
  }catch(cause){catalogue.hidden=true;status.textContent='Drop rates unavailable';error.hidden=false;error.textContent=cause.message;console.error(cause);}
}
if(typeof document!=='undefined')mount();
