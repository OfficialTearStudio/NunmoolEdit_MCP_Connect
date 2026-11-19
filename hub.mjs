import {execFile,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {createBridge,DEFAULT_ORIGINS} from './bridge.mjs';

const args=process.argv.slice(2);
const origins=[];
let port=43129;
let autoYes=false;
let openBrowser=false;
let noClip=false;

for(let i=0;i<args.length;i++){
 if(args[i]==='--port')port=Number(args[++i]);
 else if(args[i]==='--origin')origins.push(args[++i]);
 else if(args[i]==='-y'||args[i]==='--yes')autoYes=true;
 else if(args[i]==='--open')openBrowser=true;
 else if(args[i]==='--no-clip')noClip=true;
}

function stateFilePath(p){
 const dir=process.env.LOCALAPPDATA?join(process.env.LOCALAPPDATA,'donkey-editor-mcp'):join(tmpdir(),'donkey-editor-mcp');
 return join(dir,`hub-${p}.json`);
}

function findListeningPids(targetPort){
 if(process.platform!=='win32')return [];
 const res=spawnSync('netstat',['-ano','-p','tcp'],{encoding:'utf8'});
 if(res.status!==0||!res.stdout)return [];
 const pids=new Set();
 const suffix=`:${targetPort}`;
 for(const line of res.stdout.split(/\r?\n/)){
  const parts=line.trim().split(/\s+/);
  if(parts.length<5)continue;
  const [proto,localAddr,,state,pidStr]=parts;
  if(!proto.toUpperCase().startsWith('TCP'))continue;
  if(state.toUpperCase()!=='LISTENING')continue;
  if(!localAddr.endsWith(suffix))continue;
  const pid=Number(pidStr);
  if(Number.isInteger(pid)&&pid>0&&pid!==process.pid)pids.add(pid);
 }
 return [...pids];
}

function getProcessName(pid){
 if(process.platform!=='win32')return '';
 const res=spawnSync('tasklist',['/FI',`PID eq ${pid}`,'/FO','CSV','/NH'],{encoding:'utf8'});
 if(res.status!==0||!res.stdout)return '';
 const line=res.stdout.trim().split(/\r?\n/)[0]||'';
 const match=line.match(/^"([^"]+)"/);
 return match?match[1]:'';
}

function killProcesses(pids){
 for(const pid of pids){
  spawnSync('taskkill',['/PID',String(pid),'/T','/F'],{stdio:'ignore'});
 }
 try{rmSync(stateFilePath(port),{force:true});}catch{}
}

const existingPids=findListeningPids(port);
if(existingPids.length>0){
 console.log('');
 console.log(`[!] 포트 ${port}을(를) 이미 사용 중인 프로세스가 있습니다:`);
 for(const pid of existingPids){
  const name=getProcessName(pid);
  console.log(`    - PID ${pid}${name?` (${name})`:''}`);
 }
 let proceed=autoYes;
 if(!proceed){
  const rl=createInterface({input:process.stdin,output:process.stdout});
  try{
   const answer=(await rl.question('\n기존 프로세스를 모두 종료하고 새로 시작할까요? [Y/n]: ')).trim().toLowerCase();
   proceed=answer===''||answer==='y'||answer==='yes';
  }finally{
   rl.close();
  }
 }
 if(!proceed){
  console.log('취소되었습니다. 기존 프로세스를 유지합니다.');
  process.exit(0);
 }
 killProcesses(existingPids);
 await new Promise(r=>setTimeout(r,250));
}

try{rmSync(stateFilePath(port),{force:true});}catch{}

const bridge=await createBridge({
 port,
 origins:origins.length?origins:DEFAULT_ORIGINS,
 hubSecret:randomBytes(24).toString('hex'),
 advertiseHub:true,
 fallbackOnBusy:false,
 onReject:msg=>console.error(`[연결 거부] ${msg}`),
});
const info=bridge.status();

let copied=false;
if(!noClip&&process.platform==='win32'){
 try{
  const res=spawnSync('clip.exe',[],{input:info.pairingCode,encoding:'utf8'});
  copied=res.status===0;
 }catch{}
}

console.clear?.();
console.log('======================================================');
console.log('       PixelEdit (pixeledit.pages.dev) MCP 연결 대기 중');
console.log('======================================================');
console.log('');
console.log(`  연결 포트 : ${info.port}`);
console.log(`  연결 코드 : ${info.pairingCode}`);
console.log(copied?'  [연결 코드가 클립보드에 자동 복사되었습니다! Ctrl+V로 붙여넣으세요]':'  [위 연결 코드를 복사해서 웹사이트에 붙여넣으세요]');
console.log(`  허용 사이트 : ${info.allowedOrigins.join(', ')}`);
console.log('');
console.log('  연결 순서:');
console.log('   1) 브라우저에서 pixeledit.pages.dev 에 들어가 [Extension -> Ai -> MCP -> 열기] 클릭');
console.log(`   2) 연결 코드 칸에 Ctrl+V 붙여넣기 (포트: ${info.port})`);
console.log('   3) "이 탭의 편집 허용" 체크 후 [연결] 클릭');
console.log('   4) 브라우저가 "로컬 네트워크 접근 허용"을 물으면 [허용] 클릭');
console.log('');
console.log('  ※ AI 프로그램과도 연결하려면 install.bat 후 AI 프로그램을 한 번 껐다 켠 상태에서');
console.log('     AI 채팅창에 원하는 그림/파티클 작업을 말로 지시하시면 됩니다.');
console.log('  ※ 이 창을 닫으면 연결이 끊어집니다.');
console.log('======================================================');

if(openBrowser&&process.platform==='win32'){
 const primaryUrl=info.allowedOrigins.find(u=>u.startsWith('https://'))||info.allowedOrigins[0];
 if(primaryUrl)execFile('cmd.exe',['/c','start','',primaryUrl],()=>{});
}

let closing=false;
async function close(){
 if(closing)return;
 closing=true;
 await bridge.close();
 process.exit(0);
}
process.once('SIGINT',()=>void close());
process.once('SIGTERM',()=>void close());
process.once('SIGHUP',()=>void close());
