import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startLocalClient } from '../public/local/local.js';

test('normal game reconnect requires received data and preserves the earlier socket error in the log', async () => {
  const nodes = Object.fromEntries(['status','log','error','error-message','game'].map(id => [id, { textContent:'', hidden:true, dataset:{}, append(){} }]));
  class Socket extends EventTarget { close() {} }
  const previous = Object.fromEntries(['window','document','location'].map(key => [key, globalThis[key]]));
  globalThis.location = {hash:'#port=18923',origin:'https://openrotmg.org',href:'https://openrotmg.org/local/#port=18923'};
  globalThis.document = {getElementById:id=>nodes[id],addEventListener(){}};
  globalThis.window = {fetch:async()=>Response.json({protocol:1,mode:'local-development'}),WebSocket:Socket,
    RufflePlayer:{newest:()=>({createPlayer:()=>({ruffle:()=>({load:async()=>{}})})})}};
  try {
    await startLocalClient();
    const socket = new window.WebSocket('ws://127.0.0.1:18923/game');
    socket.dispatchEvent(new Event('error'));
    assert.equal(nodes.error.hidden,false);
    socket.dispatchEvent(new Event('open'));
    assert.equal(nodes.error.hidden,false);
    socket.dispatchEvent(new Event('message'));
    assert.equal(nodes.error.hidden,true);
    assert.match(nodes.log.textContent,/handshake error/);
    assert.match(nodes.log.textContent,/reconnected to the same local server/);
    assert.match(nodes.status.textContent,/Connected to your local server/);
    socket.dispatchEvent(Object.assign(new Event('close'),{code:1006,wasClean:false,reason:''}));
    assert.equal(nodes.error.hidden,false);
  } finally {
    for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value}
  }
});
