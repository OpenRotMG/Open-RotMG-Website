const percent=new Intl.NumberFormat('en',{style:'percent',maximumFractionDigits:4});
export function percentage(probability){return percent.format(probability);}
const cite=source=>[`${source.file}:${source.line}`,source.object,source.path,...source.embeds].filter(Boolean).join(' › ');
const declared=facts=>`${facts.provenance}: ${facts.reason} Origin: ${facts.origin}`;
const minimumScope='total row allocations per encounter, only when private recipients/public gate exist';
const maximumScope='total row successes; stop Bernoullis at maximum before minimum top-up';
const portalCondition='Only if this source state/hook is active at terminal claim; probability is a source attempt, not unconditional portal delivery. Route, lifetime and atomic publication require the world coordinator.';
// The server owns probability semantics; the page only labels schema-v2 attempt facts and never projects a final chance.
export function cardsFor(data,art){
  if(data?.schema_version!==2)throw Error(`Unsupported drop-rate schema ${data?.schema_version}; this page requires schema_version 2`);
  const items=new Map(data.items.map(item=>[item.id,item])),sprites=new Map(art.map(item=>[item.id,item])),cards=new Map();
  const card=(key,name,filter,sprite)=>cards.get(key)??cards.set(key,{name,filter,sprite,rows:[]}).get(key);
  // Visible wording restates the server's structured row fields; the exact technical text stays in Details.
  function loot(source,declaration,rows,conditions,unit,notes){
    for(const row of rows){
      const {pool,ownership:owner,threshold,min,max,row_origin:origin}=row.source_row,each=owner==='Private',multi=pool.length>1;
      if(!['Private','Public'].includes(owner)||each&&unit==='chest'||!each&&threshold||row.final_probability.status!=='not_projected'||new Set(pool).size!==pool.length)throw Error(`Unsupported loot row ${row.row_index} from ${source}`);
      if(min&&(row.minimum_scope!==minimumScope||row.guarantee_is_per_player!==false)||max!==null&&row.maximum_scope!==maximumScope)throw Error(`Unsupported loot limits for row ${row.row_index} from ${source}`);
      const attempt=row.attempt_item_probability_before_min_max;
      const roll=each?`Each eligible player ${max===null?'rolls':'can roll'} ${percentage(row.bernoulli_attempt_probability)} per ${unit}`:`One shared roll per ${unit}: ${percentage(row.bernoulli_attempt_probability)}`;
      const poolRoll=multi?` for one of ${pool.length} equally likely items (${percentage(attempt)} for this item on that roll)`:'';
      if(origin!=null&&(origin.provenance!=='Authored'||!origin.origin?.trim()||!origin.reason?.trim()))throw Error(`Unsupported row origin for row ${row.row_index} from ${source}`);
      const plain=[roll+poolRoll,
        ...each?[threshold?`Deal at least ${percentage(threshold)} of its health`:'Deal any damage','Soulbound (only you can see it)']:[],...notes,
        ...origin?['Reconstructed drop, not recovered with the encounter']:[],
        ...min?[`${each?'If anyone is eligible, at':'At'} least ${min}${multi?` item${min===1?'':'s'} from the ${pool.length}-item pool`:''} ${min===1?'is':'are'} given out in total per ${unit}, even if the rolls fall short`]:[],
        ...max===null?[]:[`Rolling stops after ${max} successful roll${max===1?'':'s'} per ${unit}${each?' across all eligible players':''}`]];
      const facts=[...conditions,
        `Bernoulli attempt ${percentage(row.bernoulli_attempt_probability)}; uniform pool choice ${percentage(row.uniform_pool_choice_probability)} among ${pool.length} item${pool.length===1?'':'s'}; item attempt before min/max ${percentage(row.attempt_item_probability_before_min_max)}.`,
        `Eligibility (threshold ${threshold}): ${row.eligibility}.`,
        `Minimum ${min}: ${row.minimum_scope}. Maximum ${max??'none'}: ${row.maximum_scope}.`,
        `Final per-player chance not projected: ${row.final_probability.reason}`,
        declaration,...origin?[`Drop row origin: ${declared(origin)}`]:[],`Source row ${row.row_index}: ${cite(row.source_row.source)}`];
      for(const id of pool){
        const item=items.get(id),sprite=sprites.get(id);
        if(!item||!sprite)throw Error(`Missing item or artwork ${id} from ${source}`);
        card(id,item.name,String(item.bag_type),sprite).rows.push({source,attempt,summary:plain.join(' · '),facts});
      }
    }
  }
  for(const object of data.objects){
    loot(object.name,declared(object),object.rows,[],'kill',[]);
    for(const birth of object.death_births.filter(birth=>birth.target.class==='Portal')){
      const attempt=birth.compiled_behavior.fields.Prob?.Number,portal=birth.target.name;
      if(!Number.isFinite(attempt))throw Error(`Portal death birth from ${object.name} lacks Prob`);
      if(birth.condition!==portalCondition)throw Error(`Unsupported portal condition from ${object.name}: ${birth.condition}`);
      card('portal '+birth.target.id,portal,'dungeon',null).rows.push({source:object.name,attempt,
        summary:`If its death behavior is active when it dies: ${percentage(attempt)} roll to open ${/^[AEIOU]/.test(portal)?'an':'a'} ${portal}. A successful roll does not guarantee it opens.`,facts:[birth.condition,declared(object),`Behavior: ${cite(birth.compiled_behavior.source)}`]});
    }
  }
  for(const chest of data.landmark_chests){
    if(chest.provenance!=='Authored')throw Error(`Unsupported provenance ${chest.provenance} for ${chest.landmark_name} landmark chest`);
    const ceiling=chest.success_ceiling,limit=ceiling?`Success ceiling ${ceiling.min}–${ceiling.max}: ${ceiling.draw}.`:'No success ceiling.';
    loot(`${chest.landmark_name} landmark chest`,declared(chest),chest.rows,[chest.condition,limit,`Chest: ${cite(chest.source)}`],'chest',
      ['Reconstructed chest contents',...ceiling?[`Each chest has a random cap of ${ceiling.min} to ${ceiling.max} items. Later rolls are skipped once it hits that cap.`]:[]]);
  }
  return [...cards.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(card=>({...card,rows:card.rows.sort((a,b)=>b.attempt-a.attempt)}));
}
async function json(url){const response=await fetch(url,{cache:'no-store',redirect:'error'});if(!response.ok)throw Error('Drop catalogue request failed ('+response.status+')');return response.json();}
function element(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
async function mount(){
  const status=document.querySelector('#status'),error=document.querySelector('#error'),catalogue=document.querySelector('#catalogue');
  try{
    if(!globalThis.OpenRotMGBackend)throw Error('Game backend configuration is missing');
    const [data,art]=await Promise.all([json(OpenRotMGBackend.url('/api/drop-rates')),json('../hiscores/items.json')]);
    const cards=cardsFor(data,art),bag=document.querySelector('#bag'),target=document.querySelector('#drops');
    function render(){
      target.replaceChildren();
      for(const card of cards.filter(card=>card.filter===bag.value)){
        const article=element('article',undefined,'drop'),head=element('div',undefined,'drop-head');
        if(card.sprite){const icon=element('span',undefined,'item-icon');icon.style.backgroundPosition=`${-card.sprite.x*2}px ${-card.sprite.y*2}px`;icon.setAttribute('aria-hidden','true');head.append(icon);}
        head.append(element('h2',card.name));article.append(head);
        const rates=element('ul',undefined,'rates');
        for(const row of card.rows){
          const li=element('li'),body=element('div'),details=element('details',undefined,'sources'),facts=element('ul');
          for(const fact of row.facts)facts.append(element('li',fact));
          details.append(element('summary','Details'),facts);
          body.append(element('strong',row.source),element('p',row.summary,'summary'),details);
          li.append(element('span',`${percentage(row.attempt)} roll`,'chance'),body);rates.append(li);
        }
        article.append(rates);target.append(article);
      }
    }
    bag.addEventListener('change',render);render();status.hidden=true;catalogue.hidden=false;
  }catch(cause){catalogue.hidden=true;status.hidden=true;error.hidden=false;error.textContent=cause.message;console.error(cause);}
}
if(typeof document!=='undefined')mount();
