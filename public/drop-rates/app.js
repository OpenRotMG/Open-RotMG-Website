export function rowsFor(data){
  if(!data||!Array.isArray(data.groups)||!Array.isArray(data.items))throw Error('Malformed loot catalogue');
  const items=new Map(data.items.map(item=>[item.id,item])),rows=[];
  for(const group of data.groups){
    if(!['independent','per_item','ordered','capped'].includes(group.mode)||!group.enemy?.name)throw Error('Missing loot rules');
    for(const entry of group.entries)if(!Number.isFinite(entry.probability)||entry.probability<0||entry.probability>1||!entry.items.length)throw Error('Invalid loot probability');
    const draws=group.entries.flatMap(entry=>entry.items.map(id=>({id,p:entry.probability/entry.items.length})));
    for(const id of new Set(draws.map(draw=>draw.id))){
      const item=items.get(id);if(!item)throw Error('Unknown loot item '+id);
      let chance;
      if(group.mode==='ordered'){
        let survival=1;chance=0;
        for(const entry of group.entries){if(entry.items.includes(id))chance+=survival*entry.probability/entry.items.length;survival*=1-entry.probability;}
      }else if(group.mode==='capped'){
        chance=[3,4,5,6,7].reduce((total,cap)=>{
          let absent=Array(cap+1).fill(0);absent[0]=1;
          for(const draw of draws){
            const next=Array(cap+1).fill(0);next[cap]=absent[cap];
            for(let n=0;n<cap;n++){next[n]+=absent[n]*(1-draw.p);if(draw.id!==id)next[n+1]+=absent[n]*draw.p;}
            absent=next;
          }
          return total+1-absent.reduce((a,b)=>a+b,0);
        },0)/5;
      }else chance=1-draws.filter(draw=>draw.id===id).reduce((none,draw)=>none*(1-draw.p),1);
      rows.push({item,group,chance});
    }
  }
  return rows;
}
export function percentage(chance){return new Intl.NumberFormat('en',{maximumFractionDigits:4}).format(chance*100)+'%';}
export function catalogueFor(data,art,sources){
  const sprites=new Map(art.map(item=>[item.id,item])),catalogue=new Map();
  for(const row of rowsFor(data)){
    const sprite=sprites.get(row.item.id);if(!sprite||!Number.isInteger(sprite.bag)||sprite.bag<0||sprite.bag>4)throw Error('Missing item artwork or bag: '+row.item.name);
    if(!catalogue.has(row.item.id))catalogue.set(row.item.id,{item:row.item,sprite,rates:new Map(),sources:[],npcs:new Set()});
    const card=catalogue.get(row.item.id),key=row.chance.toPrecision(12);
    if(!card.rates.has(key))card.rates.set(key,{chance:row.chance,npcs:new Set()});
    card.rates.get(key).npcs.add(row.group.enemy.name);card.npcs.add(row.group.enemy.name);
  }
  const citations=new Map();
  for(const source of sources){
    const url=new URL(source.url);
    if(url.protocol!=='https:'||url.hostname.endsWith('openrotmg.org')||url.pathname.includes('/Open-RotMG-'))throw Error('Invalid external rate source');
    for(const rate of source.rates){
      if(!Number.isFinite(rate.probability)||rate.probability<0||rate.probability>1||!rate.npc||!rate.items.length)throw Error('Invalid source drop rate');
      for(const id of rate.items){
        const card=catalogue.get(id);if(!card||!card.npcs.has(rate.npc))continue;
        const key=id+'|'+rate.probability.toPrecision(12)+'|'+source.url;
        if(!citations.has(key))citations.set(key,{card,chance:rate.probability,url:source.url,npcs:new Set()});
        citations.get(key).npcs.add(rate.npc);
      }
    }
  }
  for(const citation of citations.values()){citation.card.sources.push({chance:citation.chance,url:citation.url,npcs:[...citation.npcs].sort()});}
  return [...catalogue.values()].sort((a,b)=>a.item.name.localeCompare(b.item.name)).map(card=>({...card,rates:[...card.rates.values()].sort((a,b)=>b.chance-a.chance).map(rate=>({...rate,npcs:[...rate.npcs].sort()}))}));
}
async function json(url){const response=await fetch(url,{cache:'no-store',redirect:'error'});if(!response.ok)throw Error('Drop catalogue request failed ('+response.status+')');return response.json();}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
async function mount(){
  const status=document.querySelector('#status'),error=document.querySelector('#error'),catalogue=document.querySelector('#catalogue');
  try{
    if(!globalThis.OpenRotMGBackend)throw Error('Game backend configuration is missing');
    const [data,sources,art]=await Promise.all([json(OpenRotMGBackend.url('/api/drop-rates')),json('sources.json'),json('../hiscores/items.json')]);
    const cards=catalogueFor(data,art,sources),bag=document.querySelector('#bag'),target=document.querySelector('#drops');
    function render(){
      target.replaceChildren();
      for(const card of cards.filter(card=>card.sprite.bag===Number(bag.value))){
        const article=element('article',undefined,'drop'),head=element('div',undefined,'drop-head'),icon=element('span',undefined,'item-icon');icon.style.backgroundPosition=`${-card.sprite.x*2}px ${-card.sprite.y*2}px`;icon.setAttribute('aria-hidden','true');head.append(icon,element('h2',card.item.name));article.append(head);
        const rates=element('ul',undefined,'rates');
        for(const rate of card.rates){const li=element('li');li.append(element('span',percentage(rate.chance),'chance'),element('span',rate.npcs.join(', ')));rates.append(li);}
        article.append(rates);
        if(card.sources.length){
          const details=element('details',undefined,'sources'),list=element('ul');details.append(element('summary','Sources'));
          for(const source of card.sources){const li=element('li',percentage(source.chance)+' '+source.npcs.join(', ')+' '),link=element('a',source.url);link.href=source.url;li.append(link);list.append(li);}
          details.append(list);article.append(details);
        }
        target.append(article);
      }
    }
    bag.addEventListener('change',render);render();status.hidden=true;catalogue.hidden=false;
  }catch(cause){catalogue.hidden=true;status.hidden=true;error.hidden=false;error.textContent=cause.message;console.error(cause);}
}
if(typeof document!=='undefined')mount();
