import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateFeed, loadFeed, renderFeed} from '../public/updates/app.js';
const feed = () => ({synced_at:1700000100,source:{guild_id:'12345678901234567',channel_id:'23456789012345678',posts:[{id:'34567890123456789',content:'A new update\n\nA paragraph.\n\nAnother paragraph.',published_at:1700000000,edited_at:null}]}});
class Node {
  children=[];
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children=children;}
}
function document() {
  const nodes={'#updates':new Node(),'#status':new Node()};
  return {nodes,querySelector:selector=>nodes[selector],createElement:tag=>Object.assign(new Node(),{tag})};
}
test('updates render escaped text, dates, paragraphs and stable public/Discord links',()=>{
  const f=feed();f.source.posts[0].content='<img src=x onerror=alert(1)>\n\n<script>bad()</script>\n\nAnother paragraph.';
  f.source.posts[0].edited_at=1700000050;
  const d=document();renderFeed(f,d,1700000200000);
  const article=d.nodes['#updates'].children[0], [heading,meta,body]=article.children;
  assert.equal(article.id,'34567890123456789');
  assert.equal(heading.children[0].href,'#34567890123456789');
  assert.equal(heading.children[0].textContent,'<img src=x onerror=alert(1)>');
  assert.equal(meta.children[0].dateTime,'2023-11-14T22:13:20.000Z');
  assert.match(meta.children.at(-1).href,/^https:\/\/discord.com\/channels\/12345678901234567\/23456789012345678\/34567890123456789$/);
  assert.equal(body.textContent,'<script>bad()</script>\n\nAnother paragraph.');
  assert.match(d.nodes['#status'].textContent,/Last synced/);
  renderFeed(f,d,1700001000000);assert.match(d.nodes['#status'].textContent,/Sync is overdue/);
});
test('unsynced and empty channels differ; bad posts cannot replace published DOM',()=>{
  const d=document();renderFeed({synced_at:null,source:null},d);assert.match(d.nodes['#status'].textContent,/not been synced/);
  const f=feed();f.source.posts=[];renderFeed(f,d);assert.match(d.nodes['#status'].textContent,/No updates posted/);
  renderFeed(feed(),d);const previous=d.nodes['#updates'].children;
  const bad=feed();bad.source.posts.push({...bad.source.posts[0]});
  assert.throws(()=>renderFeed(bad,d),/Malformed/);assert.equal(d.nodes['#updates'].children,previous);
  for (const mutate of [f=>f.source.guild_id='javascript:alert(1)',f=>f.source.posts[0].id='18446744073709551616',
    f=>f.source.posts[0].published_at=-1,f=>f.source.posts[0].content='',f=>f.source.posts[0].edited_at=1,
    f=>f.source.posts[0].content='x'.repeat(8001),f=>f.source.posts[0].content='a\uffffb']) {
    const f=feed();mutate(f);assert.throws(()=>validateFeed(f),/Malformed/);
  }
});
test('page reads only the public same-origin API and reports failure explicitly',async()=>{
  const f=feed();assert.deepEqual(await loadFeed(async(url,options)=>{
    assert.equal(url,'/api/updates');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');
    assert.ok(options.signal instanceof AbortSignal);return Response.json(f);
  }),f);
  await assert.rejects(loadFeed(async()=>new Response('down',{status:503})),/503/);
  await assert.rejects(loadFeed(async()=>Response.json({})),/Malformed/);
  const app=await readFile(new URL('../public/updates/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/innerHTML|insertAdjacentHTML|document\.write|Bearer/);
  const css=await readFile(new URL('../public/updates/style.css',import.meta.url),'utf8');
  assert.match(css,/white-space: pre-wrap/);assert.match(css,/overflow-wrap: anywhere/);
});
