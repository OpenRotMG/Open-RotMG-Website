export const boards = {
  collection: {title: 'Collection', description: 'Items personally picked up from enemy drops'},
  total_fame: {title: 'Total fame', description: 'Available account fame. Earned from dead characters and reduced when spent.'},
  base_fame: {title: 'Living fame', description: 'Highest fame of an alive character per account.'},
  stars: {title: 'Stars', description: 'Class stars earned from each class’s best fame.'},
  quests: {title: 'Quests', description: 'Assigned quests completed by all of an account’s characters, alive or dead.'}
};
export function ranked(players, board) {
  if (!Object.hasOwn(boards, board)) throw new Error('Unknown hiscore category');
  if (!Array.isArray(players)) throw new Error('Malformed hiscores response');
  const seen = new Set();
  for (const p of players) {
    if (!Number.isSafeInteger(p.account) || p.account < 1 || seen.has(p.account) || typeof p.name !== 'string' || !Number.isSafeInteger(p[board]) || p[board] < 0) throw new Error('Malformed hiscores player');
    seen.add(p.account);
  }
  const sorted = [...players].sort((a, b) => b[board] - a[board] || a.account - b.account);
  let rank = 0, previous;
  return sorted.map((player, i) => {if (previous !== player[board]) rank = i + 1; previous = player[board]; return {...player, rank};});
}
const classes = {768:'Rogue',775:'Archer',782:'Wizard',784:'Priest',797:'Warrior',798:'Knight',799:'Paladin',800:'Assassin',801:'Necromancer',802:'Huntress',803:'Mystic',804:'Trickster',805:'Sorcerer'};
const families = {1:'Swords',2:'Daggers',3:'Bows',17:'Staves',8:'Wands',13:'Cloaks',15:'Quivers',11:'Spells',4:'Tomes',16:'Helms',5:'Shields',12:'Seals',18:'Poisons',19:'Skulls',20:'Traps',21:'Orbs',22:'Prisms',23:'Scepters',6:'Leather armor',7:'Heavy armor',14:'Robes',9:'Rings',10:'Consumables'};
const familyOrder = [1,2,3,17,8,13,15,11,4,16,5,12,18,19,20,21,22,23,6,7,14,9,10].map(slot => families[slot]).concat('Cloths');
const names = new Intl.Collator('en', {numeric:true, sensitivity:'base'});
export function collectionSets(items, found) {
  const groups = new Map();
  for (const item of items) {
    if (!Object.hasOwn(families,item.slot) || (item.tier !== null && (!Number.isSafeInteger(item.tier) || item.tier < 0)) || typeof item.dye !== 'boolean') throw new Error(`Missing collection metadata for item ${item.id}`);
    const group = item.dye ? 'Cloths' : families[item.slot];
    if (!groups.has(group)) groups.set(group,{name:group,items:[],obtained:0});
    const set = groups.get(group); set.items.push(item); if (found.has(item.id)) set.obtained++;
  }
  for (const set of groups.values()) {
    set.missing = set.items.length-set.obtained;
    set.items.sort((a,b) => (a.tier ?? Infinity)-(b.tier ?? Infinity) || names.compare(a.name,b.name) || a.id-b.id);
  }
  return [...groups.values()].sort((a,b) => Number(a.missing===0)-Number(b.missing===0) || a.missing-b.missing || familyOrder.indexOf(a.name)-familyOrder.indexOf(b.name));
}
export function ownershipCounts(ownership, eligible) {
  if (!ownership || !Number.isSafeInteger(ownership.players) || ownership.players<1 || !Array.isArray(ownership.items)) throw new Error('Malformed collection ownership response');
  const counts=new Map([...eligible].map(id=>[id,0])),seen=new Set();
  for (const row of ownership.items) {
    if (!counts.has(row.item) || seen.has(row.item) || !Number.isSafeInteger(row.owners) || row.owners<0 || row.owners>ownership.players) throw new Error('Malformed collection owner count');
    seen.add(row.item);counts.set(row.item,row.owners);
  }
  return counts;
}
const percent=(count,total)=>new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(100*count/total);
export function highestFameDeaths(deaths) {
  if (!Array.isArray(deaths)) throw new Error('Malformed graveyard response');
  const best = new Map();
  for (const c of deaths) {
    if (![c.account,c.id,c.total_fame,c.died_at].every(n=>Number.isSafeInteger(n)&&n>=0) || !Object.hasOwn(classes,c.class) || !Array.isArray(c.equipment) || c.equipment.length!==4 || !c.equipment.every(Number.isSafeInteger)) throw new Error('Malformed graveyard character');
    const previous=best.get(c.account);
    if (!previous || c.total_fame>previous.total_fame || (c.total_fame===previous.total_fame && (c.died_at>previous.died_at || (c.died_at===previous.died_at && c.id>previous.id)))) best.set(c.account,c);
  }
  return best;
}
async function json(path) {
  const target = path.startsWith('/api/') ? OpenRotMGBackend.url(path) : path;
  const response = await fetch(target, {cache:'no-store',redirect:'error'});
  if (!response.ok) throw new Error(`Hiscores request failed (${response.status}): ${path}`);
  return response.json();
}
export async function graveyard(request=json) {
  const deaths=new Map(); let since=0;
  while (true) {
    const page=await request(`/api/graveyard?since=${since}`);
    highestFameDeaths(page.deaths);
    for (const c of page.deaths) deaths.set(c.id,c);
    if (page.deaths.length<500) return [...deaths.values()];
    const next=Math.max(...page.deaths.map(c=>c.died_at));
    if (next<=since) throw new Error(`Cannot paginate graveyard: 500 deaths share timestamp ${since}`);
    since=next;
  }
}
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function sprite(item) {
  const node=el('span','sprite');node.style.backgroundPosition=`${-item.x}px ${-item.y}px`;node.setAttribute('aria-hidden','true');return node;
}
function portrait(character) {
  const node=el('span',`portrait-frame${character?'':' blank'}`), image=el('img');
  const name=character?classes[character.class]:'Wizard';
  image.src=`/restoration/assets/player/${name.toLowerCase()}.png`;
  image.alt=character?`${name}, highest-fame deceased character, ${character.total_fame} fame`:'No deceased character';
  node.title=image.alt;node.append(image);return node;
}
function equipment(character,catalog) {
  const tray=el('div','gear'),slots=['Weapon','Ability','Armor','Ring'];
  for (let index=0;index<4;index++) {
    const id=character?character.equipment[index]:-1, slot=el('span',`gear-slot${id===-1?' empty-slot':''}`);
    if (id===-1) {slot.title=`${slots[index]}: empty`;slot.setAttribute('aria-label',slot.title);}
    else {
      const item=catalog.get(id);if(!item)throw new Error(`Equipment sprite missing for item ${id}`);
      slot.title=`${slots[index]}: ${item.name}`;slot.setAttribute('aria-label',slot.title);
      slot.append(sprite(item),el('span','gear-tier',item.tier===null?'UT':`T${item.tier}`));
    }
    tray.append(slot);
  }
  return tray;
}
function renderCollection(profile,catalog,scores) {
  if (!Array.isArray(scores.collectible_items) || !Array.isArray(profile.items) || typeof profile.name!=='string') throw new Error('Malformed collection response');
  const eligible=new Set(scores.collectible_items),found=new Map(profile.items.map(i=>[i.item,i.found_at]));
  if (found.size!==profile.items.length || [...found.values()].some(time=>!Number.isSafeInteger(time)||time<0)) throw new Error('Malformed collection dates');
  const owners=ownershipCounts(profile.ownership,eligible),dialog=document.querySelector('#item-dialog');
  document.querySelector('#item-close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
    const box=dialog.getBoundingClientRect();
    if (event.target===dialog && (event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)) dialog.close();
  });
  const items=catalog.filter(i=>eligible.has(i.id));
  if (items.length!==eligible.size || [...found.keys()].some(id=>!eligible.has(id))) throw new Error('Collection catalogue does not match the server');
  document.querySelector('#title').textContent=`${profile.name}’s collection`;
  document.querySelector('#collected').textContent=`${found.size} / ${items.length}`;
  const total=document.querySelector('#collection-progress');total.max=items.length;total.value=found.size;
  const sets=document.querySelector('#sets');
  for (const group of collectionSets(items,found)) {
    const section=el('section','set-card'),heading=el('div','set-heading'),progress=el('progress'),grid=el('div','items');
    heading.append(el('h3','',group.name),el('span','set-percent',`${percent(group.obtained,group.items.length)}%`));
    section.dataset.missing=group.missing;progress.max=group.items.length;progress.value=group.obtained;progress.setAttribute('aria-label',`${group.name}: ${group.obtained} of ${group.items.length} obtained`);
    for (const item of group.items) {
      const obtained=found.has(item.id),tile=el('button',`item${obtained?' obtained':' missing'}`);tile.type='button';tile.dataset.id=item.id;
      tile.title=`${item.name}: ${obtained?'obtained':'not obtained'}`;
      tile.append(sprite(item),el('span','item-name',item.name));
      if (item.tier!==null && item.slot!==10) tile.append(el('span','item-tier',`T${item.tier}`));
      else if (item.slot!==10) tile.append(el('span','item-tier','UT'));
      if (obtained) {const check=el('span','check','✓');check.setAttribute('aria-hidden','true');tile.append(check);}
      tile.addEventListener('click',()=>{
        document.querySelector('#item-preview').replaceChildren(sprite(item));
        document.querySelector('#item-name').textContent=item.name;
        document.querySelector('#item-date').textContent=obtained?new Date(found.get(item.id)*1000).toLocaleString('en-GB',{timeZone:'UTC',dateStyle:'long',timeStyle:'long'}):'Not yet obtained';
        const count=owners.get(item.id),population=profile.ownership.players;
        document.querySelector('#item-owners').textContent=`${percent(count,population)}% of players · ${count} / ${population}`;
        dialog.showModal();
      });
      grid.append(tile);
    }
    section.append(heading,progress,grid);sets.append(section);
  }
  document.querySelector('#collection').hidden=false;
}
async function start() {
  const params=new URLSearchParams(location.search),board=params.get('board')??'collection',account=params.get('player');
  if (!Object.hasOwn(boards,board)) throw new Error('Unknown hiscore category');
  for (const link of document.querySelectorAll('.board-tabs a')) if (link.search===`?board=${board}`) link.setAttribute('aria-current','page');
  const status=document.querySelector('#status'),catalog=await json('items.json');
  if (account!==null) {
    if (!/^[1-9]\d*$/.test(account)) throw new Error('Invalid player');
    const [profile,scores]=await Promise.all([json(`/api/collection/${account}`),json('/api/hiscores')]);
    if (profile.account!==Number(account)) throw new Error('Collection account does not match request');
    renderCollection(profile,catalog,scores);status.hidden=true;return;
  }
  document.querySelector('#metric').textContent=boards[board].title;
  const search=document.querySelector('#search'),body=document.querySelector('tbody'),byID=new Map(catalog.map(i=>[i.id,i]));
  let rows=[],best=new Map();
  const render=()=>{
    body.replaceChildren();
    for (const player of rows.filter(p=>p.name.toLowerCase().includes(search.value.toLowerCase().trim()))) {
      const character=best.get(player.account),row=el('tr'),rank=el('td','rank',player.rank),identity=el('td'),name=el('div','player-identity');
      const playerLink=el(board==='collection'?'a':'span','player-name',player.name);
      if (board==='collection') playerLink.href=`?board=collection&player=${player.account}`;
      name.append(portrait(character),playerLink);identity.append(name);
      const gear=el('td','equipment');gear.append(equipment(character,byID));
      const value=el('td','metric-value');
      if (board==='collection') {const link=el('a','',player.collection.toLocaleString());link.href=`?board=collection&player=${player.account}`;link.setAttribute('aria-label',`${player.name}’s collection: ${player.collection} items`);value.append(link);}
      else value.textContent=player[board].toLocaleString();
      row.dataset.account=player.account;row.append(rank,identity,gear,value);body.append(row);
    }
    if (!body.children.length) {const row=el('tr'),cell=el('td','empty','No matching players.');cell.colSpan=4;row.append(cell);body.append(row);}
  };
  search.addEventListener('input',render);
  const refresh=async()=>{
    try {
      const [scores,deaths]=await Promise.all([json('/api/hiscores'),graveyard()]);rows=ranked(scores.players,board);best=highestFameDeaths(deaths);render();
      document.querySelector('#population').textContent=`${rows.length} players`;document.querySelector('#rankings').hidden=false;status.hidden=true;
    } catch(error) {status.hidden=false;status.textContent=`Update failed: ${error.message}`;console.error(error);}
  };
  await refresh();setInterval(refresh,60000);
}
if (typeof document!=='undefined') start().catch(error=>{const status=document.querySelector('#status');status.hidden=false;status.textContent=error.message;console.error(error);});
