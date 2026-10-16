const discordId = value => typeof value === 'string' && /^[1-9]\d{16,19}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const timestamp = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
export function validateFeed(feed) {
  if (!feed || (feed.synced_at === null ? feed.source !== null : !timestamp(feed.synced_at) || !feed.source || typeof feed.source !== 'object')) throw new Error('Malformed updates feed');
  if (feed.source === null) return feed;
  const {guild_id, channel_id, posts} = feed.source;
  if (!discordId(guild_id) || !discordId(channel_id) || !Array.isArray(posts) || posts.length > 100) throw new Error('Malformed updates source');
  let previous;
  for (const post of posts) {
    if (!discordId(post.id) || (previous && BigInt(post.id) >= BigInt(previous)) || typeof post.content !== 'string'
        || !post.content.trim() || post.content !== post.content.trim() || post.content.length > 8000
        || /[\x00-\x08\x0b-\x1f\x7f-\x9f]/.test(post.content) || !timestamp(post.published_at)
        || !(post.edited_at === null || (timestamp(post.edited_at) && post.edited_at >= post.published_at))) throw new Error('Malformed update post');
    previous = post.id;
  }
  return feed;
}
export async function loadFeed(fetchImpl = fetch) {
  const response = await fetchImpl('/api/updates', {cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`Updates request failed (${response.status})`);
  return validateFeed(await response.json());
}
export function renderFeed(feed, document, now = Date.now()) {
  validateFeed(feed);
  const container = document.querySelector('#updates');
  const nodes = [];
  if (feed.source) for (const post of feed.source.posts) {
    const article = document.createElement('article'), heading = document.createElement('h2'), permalink = document.createElement('a');
    const meta = document.createElement('p'), date = document.createElement('time'), original = document.createElement('a'), body = document.createElement('p');
    article.className = 'update'; article.id = post.id;
    const headline = post.content.split('\n', 1)[0];
    permalink.href = `#${post.id}`; permalink.textContent = headline; heading.append(permalink);
    date.dateTime = new Date(post.published_at * 1000).toISOString(); date.textContent = new Date(post.published_at * 1000).toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'});
    meta.className = 'meta'; meta.append(date);
    if (post.edited_at !== null) meta.append(` · Edited ${new Date(post.edited_at * 1000).toLocaleDateString()}`);
    original.href = `https://discord.com/channels/${feed.source.guild_id}/${feed.source.channel_id}/${post.id}`; original.textContent = 'View original on Discord';
    meta.append(' · ', original);
    body.className = 'content'; body.textContent = post.content.slice(headline.length).trim();
    article.append(heading, meta, body); nodes.push(article);
  }
  container.replaceChildren(...nodes);
  document.querySelector('#status').textContent = feed.synced_at === null ? 'Updates have not been synced yet.'
    : `${nodes.length ? 'Recent updates' : 'No updates posted yet'}. Last synced ${new Date(feed.synced_at * 1000).toLocaleString()}.${now - feed.synced_at * 1000 > 300000 ? ' Sync is overdue; these posts may be out of date.' : ''}`;
}
async function start() {
  const refresh = async () => {
    try {renderFeed(await loadFeed(), document);}
    catch (error) {document.querySelector('#status').textContent = `${error.message}. Previously loaded posts may be out of date.`; console.error(error);}
  };
  await refresh();
  if (location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView();
    else document.querySelector('#status').textContent += ' The linked update is not in the recent feed.';
  }
  setInterval(refresh, 60000);
}
if (typeof document !== 'undefined') void start();
