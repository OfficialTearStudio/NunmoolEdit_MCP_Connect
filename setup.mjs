import {writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_ORIGINS} from './bridge.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const serverPath=resolve(here,'server.mjs').replaceAll('\\','/');
const args=[serverPath];
for(const origin of DEFAULT_ORIGINS){args.push('--origin',origin);}
const entry={command:'node',args};
const readyConfig={mcpServers:{'donkey-editor':entry}};

const generatedFile=join(here,'mcp-config.ready.json');
const readyJson=`${JSON.stringify(readyConfig,null,2)}\n`;
writeFileSync(generatedFile,readyJson,'utf8');

console.log('');
console.log('======================================================');
console.log('         Donkey Edit MCP 패키지 설치 완료');
console.log('======================================================');
console.log('');
console.log('1) 사용 중인 AI 프로그램의 MCP 설정 파일에 아래 내용을 추가하세요.');
console.log('   (이미 다른 MCP가 있다면 "mcpServers" 안에 "donkey-editor" 항목만 넣으세요)');
console.log(`   참고 파일로도 저장됨: ${generatedFile}`);
console.log('');
console.log(readyJson.trimEnd());
console.log('');
console.log('   주요 AI 프로그램 설정 위치:');
console.log('   - Antigravity    : %USERPROFILE%\\.gemini\\config\\mcp_config.json');
console.log('   - Claude Desktop : %APPDATA%\\Claude\\claude_desktop_config.json');
console.log('   - Cursor         : %USERPROFILE%\\.cursor\\mcp.json');
console.log('   - Codex          : %USERPROFILE%\\.codex\\config.toml (README 참고)');
console.log('');
console.log('2) 설정 저장 후 AI 프로그램을 한 번 껐다 켜 주세요(또는 MCP 새로고침).');
console.log('3) 그다음 start-mcp.bat 을 실행하고 pixeledit.pages.dev 에 연결하세요.');
console.log('======================================================');
