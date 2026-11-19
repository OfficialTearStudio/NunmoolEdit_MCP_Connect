import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createBridge,connectOrCreateBridge} from '../bridge.mjs';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const origin='https://editor.example';
async function pair(bridge,{write=true,token=bridge.token}={}){const ws=new WebSocket(`ws://127.0.0.1:${bridge.port}/editor`,{origin});await once(ws,'open');const response=once(ws,'message');ws.send(JSON.stringify({type:'hello',version:1,token,write,title:'Test editor'}));return {ws,response};}
test('exact origin and authentication reject unapproved connections',async t=>{
 const b=await createBridge({port:0,origins:[origin]});t.after(()=>b.close());
 const wrong=new WebSocket(`ws://127.0.0.1:${b.port}/editor`,{origin:'https://evil.example'});const error=await once(wrong,'error');assert.match(error[0].message,/403/);
 const ws=new WebSocket(`ws://127.0.0.1:${b.port}/editor`,{origin});await once(ws,'open');const closed=once(ws,'close');ws.send(JSON.stringify({type:'hello',version:1,token:'wrong'}));assert.equal((await closed)[0],1008);assert.equal(b.status().sessions.length,0);
});
test('routes results, enforces read-only, rejects concurrent commands and cleans disconnect',async t=>{
 const b=await createBridge({port:0,origins:[origin]});t.after(()=>b.close());
 const {ws,response}=await pair(b,{write:false});const welcome=JSON.parse((await response)[0]);
 await assert.rejects(b.call('editor_paint',{}),/read-only/);
 const message=once(ws,'message'),request=b.call('editor_state',{}, {readOnly:true});const command=JSON.parse((await message)[0]);
 await assert.rejects(b.call('editor_state',{}, {readOnly:true}),/another command/);
 ws.send(JSON.stringify({type:'result',id:command.id,result:{width:64}}));assert.deepEqual(await request,{width:64});
 const next=b.call('editor_state',{}, {sessionId:welcome.sessionId,readOnly:true});const rejection=assert.rejects(next,/disconnected/);ws.close();await rejection;assert.equal(b.status().sessions.length,0);
});
test('multiple tabs require explicit session and timeout revokes late replies',async t=>{
 const b=await createBridge({port:0,origins:[origin],timeout:40});t.after(()=>b.close());
 const one=await pair(b),two=await pair(b);await one.response;await two.response;
 await assert.rejects(b.call('editor_state',{}, {readOnly:true}),/sessionId/);
 const id=b.status().sessions[0].id;await assert.rejects(b.call('editor_state',{}, {readOnly:true,sessionId:id}),/UNKNOWN/);
});
test('official SDK client discovers tools, guide and setup over stdio',async()=>{
 const client=new Client({name:'test-client',version:'1.0'});
 const transport=new StdioClientTransport({command:process.execPath,args:['server.mjs','--port','43218','--origin',origin],cwd:process.cwd(),stderr:'pipe'});
 try{await client.connect(transport);const tools=await client.listTools();assert.ok(tools.tools.some(tool=>tool.name==='editor_paint'));assert.ok(tools.tools.some(tool=>tool.name==='particle_update'));
 const status=await client.callTool({name:'bridge_status',arguments:{}});const data=JSON.parse(status.content[0].text);assert.equal(data.port,43218);assert.equal(data.pairingCode.length,48);
 const guide=await client.readResource({uri:'donkey://guide'});assert.match(guide.contents[0].text,/WORKFLOW/);
 const fail=await client.callTool({name:'editor_state',arguments:{}});assert.equal(fail.isError,true);assert.match(fail.content[0].text,/No editor connected/);
 }finally{await client.close();}
});
test('multiple clients share one hub on the same port without EADDRINUSE',async t=>{
 const hub=await connectOrCreateBridge({port:43219,origins:[origin]});
 const peer=await connectOrCreateBridge({port:43219,origins:[origin]});
 t.after(async()=>{await peer.close();await hub.close();});
 assert.equal(hub.isSharedHub,false);
 assert.equal(peer.isSharedHub,true);
 const [s1,s2]=[await hub.status(),await peer.status()];
 assert.equal(s1.port,43219);
 assert.equal(s2.port,43219);
 assert.equal(s2.pairingCode,s1.pairingCode);
 const {ws,response}=await pair({port:43219,token:s1.pairingCode});
 await response;
 const msg=once(ws,'message');
 const req=peer.call('editor_state',{},{readOnly:true});
 const cmd=JSON.parse((await msg)[0]);
 ws.send(JSON.stringify({type:'result',id:cmd.id,result:{width:32}}));
 assert.deepEqual(await req,{width:32});
 ws.close();
});
test('peer client reattaches automatically after shared hub restarts',async t=>{
 let hub=await connectOrCreateBridge({port:43221,origins:[origin]});
 const peer=await connectOrCreateBridge({port:43221,origins:[origin]});
 t.after(async()=>{await peer.close();await hub.close();});
 const firstCode=(await hub.status()).pairingCode;
 assert.equal((await peer.status()).pairingCode,firstCode);
 await hub.close();
 hub=await connectOrCreateBridge({port:43221,origins:[origin]});
 const secondCode=(await hub.status()).pairingCode;
 assert.notEqual(secondCode,firstCode);
 assert.equal((await peer.status()).pairingCode,secondCode);
});
