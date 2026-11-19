import {createServer} from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket,WebSocketServer} from 'ws';

export const DEFAULT_ORIGINS=['https://pixeledit.pages.dev'];

function safeEqualText(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const ba=Buffer.from(a),bb=Buffer.from(b);
 return ba.length===bb.length&&timingSafeEqual(ba,bb);
}

function hubStatePath(port){
 const dir=process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'donkey-editor-mcp'):join(tmpdir(),'donkey-editor-mcp');
 return {dir,file:join(dir,`hub-${port}.json`)};
}

export function readHubState(port){
 try{
  const data=JSON.parse(readFileSync(hubStatePath(port).file,'utf8'));
  if(Number.isInteger(data?.port)&&typeof data?.secret==='string'&&Array.isArray(data?.origins))return data;
 }catch{}
 return null;
}

function writeHubState(port,state){
 const {dir,file}=hubStatePath(port);
 mkdirSync(dir,{recursive:true});
 writeFileSync(file,JSON.stringify(state),'utf8');
 return file;
}

function removeHubState(file,expectedSecret){
 if(!file)return;
 try{
  const current=JSON.parse(readFileSync(file,'utf8'));
  if(current?.secret===expectedSecret)rmSync(file,{force:true});
 }catch{}
}

export async function createBridge({port=43129,origins=DEFAULT_ORIGINS,token=randomBytes(24).toString('hex'),timeout=60000,hubSecret=null,advertiseHub=false,fallbackOnBusy=false,onReject=null}={}){
 const allowed=new Set(origins.map(value=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.origin!==value)throw Error('Origin must be exact http(s) origin without a path');return value;}));
 const sessions=new Map(),pending=new Map();
 const server=createServer((_req,res)=>{res.writeHead(404,{'Cache-Control':'no-store'});res.end('Not found');});
 const sockets=new WebSocketServer({noServer:true,maxPayload:8*1024*1024,perMessageDeflate:false});
 const clients=hubSecret?new WebSocketServer({noServer:true,maxPayload:8*1024*1024,perMessageDeflate:false}):null;

 server.on('upgrade',(req,socket,head)=>{
  const loopback=['127.0.0.1','::ffff:127.0.0.1'].includes(socket.remoteAddress);
  if(!loopback){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  if(req.url==='/mcp-client'&&clients&&!req.headers.origin&&safeEqualText(req.headers['x-donkey-hub-secret'],hubSecret)){
   clients.handleUpgrade(req,socket,head,ws=>clients.emit('connection',ws));
   return;
  }
  if(req.url!=='/editor'||!allowed.has(req.headers.origin)){if(req.url==='/editor'&&!allowed.has(req.headers.origin))onReject?.(`허용되지 않은 사이트 주소: ${req.headers.origin||'(없음)'}`);socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  sockets.handleUpgrade(req,socket,head,ws=>sockets.emit('connection',ws,req));
 });

 function settle(id,error,result){const item=pending.get(id);if(!item)return;pending.delete(id);clearTimeout(item.timer);item.abort?.();item.session.busy=false;error?item.reject(error):item.resolve(result);}

 sockets.on('connection',(ws,req)=>{
  let session;ws.alive=true;
  const authTimer=setTimeout(()=>ws.close(1008,'Pairing timed out'),10000);authTimer.unref();
  ws.on('pong',()=>{ws.alive=true;});ws.on('error',()=>{});
  ws.on('message',raw=>{try{
   const data=JSON.parse(raw.toString());
   if(!session){
    if(data.type!=='hello'||data.version!==1||!safeEqualText(data.token,token)){onReject?.('연결 코드가 일치하지 않습니다.');ws.close(1008,'Invalid pairing code');return;}
    if(sessions.size>=16){ws.close(1008,'Too many browser sessions');return;}
    clearTimeout(authTimer);session={id:randomUUID(),ws,origin:req.headers.origin,title:String(data.title??'Editor').slice(0,160),write:data.write===true,busy:false,connectedAt:new Date().toISOString()};sessions.set(session.id,session);
    ws.send(JSON.stringify({type:'welcome',version:1,sessionId:session.id}));return;
   }
   if(data.type==='result'&&typeof data.id==='string'&&pending.get(data.id)?.session===session){
    if(typeof data.error==='string')settle(data.id,Error(data.error));else settle(data.id,null,data.result);
   }
  }catch{ws.close(1008,'Invalid message');}});
  ws.on('close',()=>{clearTimeout(authTimer);if(!session)return;sessions.delete(session.id);for(const [id,item]of pending)if(item.session===session)settle(id,Error('Browser disconnected; outcome may be unknown. Inspect state before retrying.'));});
 });

 function status(){return {port:actualPort,pairingCode:token,allowedOrigins:[...allowed],sessions:[...sessions.values()].map(({id,origin,title,write,busy,connectedAt})=>({id,origin,title,write,busy,connectedAt}))};}

 async function call(name,args,{sessionId,readOnly=false,signal}={}){
  const session=sessionId?sessions.get(sessionId):sessions.size===1?[...sessions.values()][0]:null;
  if(!session)throw Error(sessions.size?'Pass sessionId from bridge_status to select a connected tab.':'No editor connected. Open the editor -> Extension -> Ai -> MCP and enter the pairing code.');
  if(!readOnly&&!session.write)throw Error('This browser is read-only. User must disconnect and enable editing before reconnecting.');
  if(session.busy)throw Error('This browser is processing another command. Wait and inspect state; do not retry automatically.');
  if(signal?.aborted)throw Error('Request cancelled before dispatch.');
  session.busy=true;
  return new Promise((resolve,reject)=>{
   const id=randomUUID(),expiresAt=Date.now()+timeout;
   const timer=setTimeout(()=>{settle(id,Error('Command timed out; outcome UNKNOWN. Inspect state before retrying.'));session.ws.close(1011,'Command timed out; reconnect and inspect state');},timeout);timer.unref();
   const abort=()=>{settle(id,Error('Request cancelled; dispatched command may have run. Inspect state before retrying.'));session.ws.close(1011,'Request cancelled');};
   signal?.addEventListener('abort',abort,{once:true});
   pending.set(id,{session,resolve,reject,timer,abort:()=>signal?.removeEventListener('abort',abort)});
   try{session.ws.send(JSON.stringify({type:'command',id,name,args,expiresAt}));}catch(error){settle(id,error);}
  });
 }

 if(clients){
  clients.on('connection',ws=>{
   const inflight=new Map();
   ws.on('error',()=>{});
   ws.on('message',async raw=>{
    let msg;try{msg=JSON.parse(raw.toString());}catch{return;}
    const id=msg?.id;if(typeof id!=='string')return;
    if(msg.op==='status'){
     ws.send(JSON.stringify({id,result:status()}));return;
    }
    if(msg.op==='cancel'){
     inflight.get(id)?.abort();return;
    }
    if(msg.op==='call'){
     const ac=new AbortController();
     inflight.set(id,ac);
     try{
      const result=await call(msg.name,msg.args,{sessionId:msg.sessionId,readOnly:!!msg.readOnly,signal:ac.signal});
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id,result}));
     }catch(error){
      if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id,error:error instanceof Error?error.message:String(error)}));
     }finally{inflight.delete(id);}
    }
   });
   ws.on('close',()=>{for(const ac of inflight.values())ac.abort();inflight.clear();});
  });
 }

 const heartbeat=setInterval(()=>{for(const ws of sockets.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);heartbeat.unref();

 async function listenOn(targetPort){
  await new Promise((resolve,reject)=>{
   const onError=err=>{server.off('listening',onListening);reject(err);};
   const onListening=()=>{server.off('error',onError);resolve();};
   server.once('error',onError);
   server.once('listening',onListening);
   server.listen(targetPort,'127.0.0.1');
  });
 }

 try{
  await listenOn(port);
 }catch(error){
  if(fallbackOnBusy&&error?.code==='EADDRINUSE'&&port!==0){
   await listenOn(0);
  }else{
   clearInterval(heartbeat);
   throw error;
  }
 }

 const actualPort=server.address().port;
 const stateFile=advertiseHub&&hubSecret?writeHubState(actualPort,{port:actualPort,pid:process.pid,origins:[...allowed],secret:hubSecret}):null;
 const cleanupState=()=>removeHubState(stateFile,hubSecret);
 if(stateFile)process.once('exit',cleanupState);

 return {
  port:actualPort,token,isSharedHub:false,
  status,call,
  async close(){
   if(stateFile)process.off('exit',cleanupState);
   cleanupState();
   clearInterval(heartbeat);
   for(const [id]of pending)settle(id,Error('Bridge shutting down'));
   for(const ws of sockets.clients)ws.terminate();
   if(clients)for(const ws of clients.clients)ws.terminate();
   await new Promise(resolve=>sockets.close(resolve));
   if(clients)await new Promise(resolve=>clients.close(resolve));
   await new Promise(resolve=>server.close(resolve));
  }
 };
}

export async function connectToHub({port,origins=DEFAULT_ORIGINS}){
 const info=readHubState(port);
 if(!info)return null;
 const hubOrigins=new Set(info.origins);
 if(origins.some(o=>!hubOrigins.has(o)))return null;
 const ws=new WebSocket(`ws://127.0.0.1:${info.port}/mcp-client`,{headers:{'x-donkey-hub-secret':info.secret}});
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{ws.terminate();reject(Error('Hub connect timeout'));},1200);
  ws.once('open',()=>{clearTimeout(timer);resolve();});
  ws.once('error',err=>{clearTimeout(timer);reject(err);});
 });
 const replies=new Map();
 ws.on('message',raw=>{
  try{
   const msg=JSON.parse(raw.toString());
   const pending=replies.get(msg.id);if(!pending)return;
   replies.delete(msg.id);
   if(typeof msg.error==='string')pending.reject(Error(msg.error));else pending.resolve(msg.result);
  }catch{}
 });
 ws.on('close',()=>{
  for(const p of replies.values())p.reject(Error('Shared MCP bridge closed. Reconnect or restart start-mcp.bat.'));
  replies.clear();
 });
 function rpc(op,payload={},signal){
  if(ws.readyState!==WebSocket.OPEN)return Promise.reject(Error('Shared MCP bridge is disconnected.'));
  const id=randomUUID();
  return new Promise((resolve,reject)=>{
   const onAbort=()=>{
    if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({id,op:'cancel'}));
   };
   signal?.addEventListener('abort',onAbort,{once:true});
   replies.set(id,{
    resolve:v=>{signal?.removeEventListener('abort',onAbort);resolve(v);},
    reject:e=>{signal?.removeEventListener('abort',onAbort);reject(e);},
   });
   ws.send(JSON.stringify({id,op,...payload}));
  });
 }
 const initial=await rpc('status');
 return {
  port:initial.port,
  token:initial.pairingCode,
  isSharedHub:true,
  alive:()=>ws.readyState===WebSocket.OPEN,
  status:()=>rpc('status'),
  call:(name,args,{sessionId,readOnly=false,signal}={})=>rpc('call',{name,args,sessionId,readOnly},signal),
  async close(){ws.close();},
 };
}

export async function connectOrCreateBridge({port=43129,origins=DEFAULT_ORIGINS,timeout=60000,fallbackOnBusy=true}={}){
 async function acquire(){
  for(let attempt=0;attempt<2;attempt++){
   try{
    const existing=await connectToHub({port,origins});
    if(existing)return existing;
   }catch{}
   try{
    return await createBridge({
     port,origins,timeout,
     hubSecret:randomBytes(24).toString('hex'),
     advertiseHub:true,
     fallbackOnBusy:attempt>0&&fallbackOnBusy,
    });
   }catch(error){
    if(error?.code!=='EADDRINUSE')throw error;
    await new Promise(r=>setTimeout(r,120));
   }
  }
  return createBridge({port:0,origins,timeout,hubSecret:randomBytes(24).toString('hex'),advertiseHub:true});
 }
 let current=await acquire();
 let closed=false;
 let reconnecting=null;
 async function ensure(){
  if(closed)throw Error('Bridge closed');
  if(!current.isSharedHub||current.alive())return current;
  if(!reconnecting)reconnecting=acquire().then(next=>{current=next;return next;}).finally(()=>{reconnecting=null;});
  return reconnecting;
 }
 return {
  get port(){return current.port;},
  get token(){return current.token;},
  get isSharedHub(){return current.isSharedHub;},
  async status(){return (await ensure()).status();},
  async call(name,args,opts){return (await ensure()).call(name,args,opts);},
  async close(){closed=true;await current.close();},
 };
}
