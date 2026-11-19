import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
import {connectOrCreateBridge,DEFAULT_ORIGINS} from './bridge.mjs';
import {tools,guide} from './catalog.mjs';
const args=process.argv.slice(2),origins=[];let port=43129,strictPort=false;
for(let i=0;i<args.length;i++){
 if(args[i]==='--port'){port=Number(args[++i]);strictPort=true;if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid --port');}
 else if(args[i]==='--origin'){origins.push(args[++i]);}
 else if(args[i]==='--help'){console.error('node server.mjs [--port 43129] [--origin https://your-editor.example] (repeat --origin for multiple sites). MCP uses stdio. Pairing code: call bridge_status.');process.exit(0);}
 else throw Error(`Unknown argument: ${args[i]}`);
}
const bridge=await connectOrCreateBridge({port,origins:origins.length?origins:DEFAULT_ORIGINS,fallbackOnBusy:!strictPort});
const mcp=new McpServer({name:'donkey-editor',version:'0.1.0'},{instructions:guide});
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
mcp.registerTool('bridge_status',{description:'Start here. Read pairing code, local port, allowed origins and connected editor tabs. Pairing code is a secret; give it only to the user. No project pixels are read.',inputSchema:{},annotations:{readOnlyHint:true,openWorldHint:false}},async()=>result(await bridge.status()));
mcp.registerResource('editor-guide','donkey://guide',{description:'How to connect and control Donkey Edit',mimeType:'text/plain'},async uri=>({contents:[{uri:uri.href,text:guide,mimeType:'text/plain'}]}));
mcp.registerPrompt('getting-started',{description:'Connection and editing workflow'},async()=>({messages:[{role:'user',content:{type:'text',text:guide}}]}));
for(const tool of tools){
 mcp.registerTool(tool.name,{description:tool.description,inputSchema:{...tool.schema,sessionId:z.string().uuid().optional()},annotations:{readOnlyHint:!!tool.readOnly,destructiveHint:!!tool.destructive,openWorldHint:false}},async(input,extra)=>{
  try{
   const {sessionId,...payload}=input;
   // Read-only tools can still change an internal clipboard but never project artwork.
   const value=await bridge.call(tool.name,payload,{sessionId,readOnly:!!tool.readOnly,signal:extra.signal});
   if(value&&typeof value.png==='string'&&['editor_preview','particle_playback','editor_grid_paper'].includes(tool.name)){
    if(!value||typeof value.png!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.png))throw Error('Invalid browser image response');
    const {png,...meta}=value;
    return {content:[{type:'image',mimeType:'image/png',data:png},{type:'text',text:JSON.stringify(meta)}]};
   }
   return result(value);
  }catch(error){return {isError:true,content:[{type:'text',text:error instanceof Error?error.message:String(error)}]};}
 });
}
console.error(`Donkey MCP (${bridge.isSharedHub?'joined shared hub':'hub'}): ws://127.0.0.1:${bridge.port}/editor | pairing code: ${bridge.token}`);
let closing=false;
async function close(){if(closing)return;closing=true;await bridge.close();await mcp.close();}
process.once('SIGINT',()=>void close());process.once('SIGTERM',()=>void close());process.stdin.once('end',()=>void close());
await mcp.connect(new StdioServerTransport());
