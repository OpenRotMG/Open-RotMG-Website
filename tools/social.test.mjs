import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {socialMetadata} from './social.mjs';
const publicRoot=new URL('../public/',import.meta.url),image='https://openrotmg.org/social.png?v=fixture';
function* pages(dir) {
  for (const entry of readdirSync(dir,{withFileTypes:true})) {
    const path=join(dir,entry.name);
    if(entry.isDirectory())yield* pages(path);
    else if(entry.name.endsWith('.html'))yield path;
  }
}
test('Hiscores artwork has share-card dimensions and supports its own descriptive alt text',()=>{
 const png=readFileSync(new URL('../public/hiscores/social.png',import.meta.url));
 assert.equal(png.readUInt32BE(16),1200);assert.equal(png.readUInt32BE(20),630);
 const original=readFileSync(new URL('../public/hiscores/index.html',import.meta.url),'utf8');
 const html=socialMetadata(original,'https://openrotmg.org/hiscores/social.png','Custom Hiscores artwork');
 for(const key of ['og:image:alt','twitter:image:alt'])assert.ok(html.includes(`=\"${key}\" content=\"Custom Hiscores artwork\"`));
});

test('every public page has one complete preview, using its own title, description and canonical URL',()=>{
  let count=0;
  for(const path of pages(publicRoot.pathname)){
    const original=readFileSync(path,'utf8').replaceAll('{{SITE_URL}}','https://openrotmg.org/');
    const html=socialMetadata(original,image);
    if(original.includes('noindex')){assert.equal(html,original);assert.doesNotMatch(html,/og:image|twitter:image/);continue;}
    count++;
    const title=original.match(/<title>([^<]+)<\/title>/)[1];
    const description=original.match(/<meta name="description" content="([^"]+)"/)[1];
    const canonical=original.match(/<link rel="canonical" href="([^"]+)"/)[1];
    for(const [key,value] of [['og:title',title],['og:description',description],['og:url',canonical],['og:image',image],['og:image:width','1200'],['og:image:height','630'],['twitter:card','summary_large_image'],['twitter:title',title],['twitter:description',description],['twitter:image',image]]){
      assert.equal(html.split(`="${key}"`).length-1,1,path+' '+key);
      assert.ok(html.includes(`="${key}" content="${value}"`),path+' '+key);
    }
  }
  assert.ok(count>=8);
  assert.throws(()=>socialMetadata('<html><head><title>Missing details</title></head></html>',image),/require a title, description and canonical/);
});
