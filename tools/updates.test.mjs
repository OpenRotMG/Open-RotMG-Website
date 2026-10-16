import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateFeed, loadFeed, renderFeed} from '../public/updates/app.js';
const feed = () => ({synced_at:1700000100,source:{guild_id:'12345678901234567',channel_id:'23456789012345678',posts:[{id:'34567890123456789',content:'A new update\n\nA paragraph.\n\nAnother paragraph.',published_at:1700000000,edited_at:null}]}});
class Node {
  children=[];
  append(...children) {this.children.push(...children);}
  setAttribute(name,value) {this[name]=value;}
  addEventListener(name,callback) {this[name]=callback;}
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
test('attachments render inline media or file links and report expired media',()=>{
  const f=feed(), url='https://cdn.discordapp.com/attachments/23456789012345678/34567890123456789/';
  f.source.posts[0].attachments=[{filename:'demo.mp4',url:url+'demo.mp4?ex=abc&hm=def',content_type:'video/mp4'},
    {filename:'screen.png',url:url+'screen.png',content_type:'image/png'},
    {filename:'notes.txt',url:url+'notes.txt',content_type:null}];
  const d=document();renderFeed(f,d);
  const [video,image,file]=d.nodes['#updates'].children[0].children.slice(3);
  assert.equal(video.children[0].tag,'video');assert.equal(video.children[0].controls,true);
  assert.equal(video.children[0].preload,'metadata');assert.equal(video.children[0].src,f.source.posts[0].attachments[0].url);
  assert.equal(image.children[0].tag,'img');assert.equal(image.children[0].alt,'screen.png');
  assert.equal(file.children.length,1);assert.equal(file.children[0].href,url+'notes.txt');
  const playing=d.nodes['#updates'].children;
  f.synced_at+=60;renderFeed(f,d);assert.equal(d.nodes['#updates'].children,playing);
  video.children[0].error();assert.match(video.children.at(-1).textContent,/Unable to load attachment: demo.mp4/);
  for (const bad of ['javascript:alert(1)','https://cdn.discordapp.com.evil.test/attachments/x','https://example.org/a.mp4']) {
    f.source.posts[0].attachments[0].url=bad;assert.throws(()=>renderFeed(f,d),/Malformed update attachment/);
  }
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
