import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/bug-report.js',import.meta.url),'utf8');
function fixture(){
 const element=()=>({listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},textContent:'',value:'',disabled:false,hidden:true,scrollIntoView(){}});
 const panel=element(),form=element(),description=element(),image=element(),status=element(),submit=element(),refresh=element(),link=element();
 form.querySelector=()=>submit;
 const nodes={'#bug-report':panel,'#bug-form':form,'#bug-description':description,'#bug-screenshot':image,'#bug-status':status,'#bug-refresh':refresh,'a[href="/#bug-report"]':link};
 let captureError=false,resolveRequest;const posts=[];
 const context={window:{},location:{hash:''},AbortSignal,requestAnimationFrame:fn=>fn(),document:{querySelector:selector=>{assert(selector in nodes,selector);return nodes[selector];},createElement:tag=>{assert.equal(tag,'canvas');return {getContext:()=>({drawImage(){if(captureError)throw Error('frame unavailable');}}),toDataURL:()=> 'data:image/png;base64,cG5n'};}},OpenRotMGBackend:{fetch:async(path,options)=>{posts.push({path,options});return new Promise(resolve=>{resolveRequest=resolve;});}}};
 runInNewContext(source,context);
 context.window.OpenRotMGBugReport.start('a'.repeat(32),{shadowRoot:{querySelector:selector=>{assert.equal(selector,'canvas');return {width:800,height:600};}}});
 return {panel,description,image,status,submit,posts,refresh,failCapture:()=>{captureError=true;},respond:(ok,value)=>resolveRequest({ok,status:ok?200:400,json:async()=>value}),open:async()=>{panel.open=true;panel.listeners.toggle();await new Promise(setImmediate);},send:()=>form.listeners.submit({preventDefault(){}})};
}
test('report sends only description and game PNG; preserves failures and rejects concurrent submits',async()=>{
 const f=fixture();await f.open();assert.equal(f.submit.disabled,false);assert.match(f.image.src,/^data:image\/png/);
 f.description.value='First line\nReferences appreciated';let sending=f.send();assert.equal(f.posts.length,1);await f.refresh.listeners.click();await f.send();assert.equal(f.posts.length,1);
 assert.equal(f.posts[0].path,`/api/diagnostics/${'a'.repeat(32)}/report`);
 assert.deepEqual(JSON.parse(f.posts[0].options.body),{message:f.description.value,screenshot:'cG5n'});
 f.respond(false,{error:'Connect to a character before reporting.'});await sending;
 assert.match(f.status.textContent,/Connect to a character/);assert.match(f.description.value,/First line/);
 sending=f.send();f.respond(true,{id:'b'.repeat(24)});await sending;assert.equal(f.description.value,'');assert.match(f.status.textContent,/Report submitted/);
});
test('screenshot failure is explicit and never submits a pretend image',async()=>{
 const f=fixture();f.failCapture();await f.open();assert(f.submit.disabled);assert(f.image.hidden);assert.match(f.status.textContent,/Screenshot failed: frame unavailable/);await f.send();assert.equal(f.posts.length,0);
});
