# PixelEdit · 로컬 MCP 연결 브리지 (`donkey-editor-mcp`)

내 PC에서 사용하는 **AI 프로그램(Antigravity, Claude Code, Claude Desktop, Cursor, Codex 등)** 이 브라우저의 **`https://pixeledit.pages.dev`** 캔버스·애니메이션·파티클을 직접 보고 그릴 수 있게 이어주는 로컬 MCP 브리지입니다.

- 이 패키지 안에는 웹 에디터 소스가 들어 있지 않으며, 허용된 **29개 픽셀·레이어·확장·파티클 MCP 도구**만 전달합니다.
- 외부 API 키, 별도 서버, 계정 로그인 없이 내 PC 안에서만 동작합니다.

---

## 🤖 AI 에이전트에게 설치·연결 맡기기 (가장 쉬운 방법)

**Antigravity / Cursor / Codex / Claude Code** 등을 쓰고 있다면, 이 폴더를 연 뒤 채팅에 아래처럼 말씀하세요.

> *"README.md 읽고 donkey-editor MCP 설치해서 내 설정에 연결해 줘."*

<details>
<summary>에이전트용 자동 설정 절차 (Agent Setup Instructions)</summary>

사용자가 이 MCP의 설치 또는 연결을 요청하면 아래 순서대로 진행하세요.

1. **의존성 설치 및 경로 생성 (대화형 pause 없이 실행):**
   - Windows: 이 폴더에서 `install.bat --no-pause` 실행 *(Node.js `22.18+`가 없으면 `winget`으로 자동 설치 시도 후 `npm ci --omit=dev` 및 `node setup.mjs` 실행)*
   - 이미 Node `22.18+`가 있다면 `npm ci --omit=dev && node setup.mjs` 직접 실행 가능
2. **생성된 설정(`mcp-config.ready.json`) 병합 등록:**
   - 같은 폴더에 생성된 `mcp-config.ready.json`을 읽어, 사용자가 쓰는 AI 클라이언트의 MCP 설정 파일에 `"donkey-editor"` 항목만 **기존 MCP 서버를 지우지 않고** 추가합니다.
     - Antigravity: `%USERPROFILE%\.gemini\config\mcp_config.json` (또는 설정 파일 경로 확인)
     - Cursor: `%USERPROFILE%\.cursor\mcp.json`
     - Claude Desktop: `%APPDATA%\Claude\claude_desktop_config.json`
     - Codex: `%USERPROFILE%\.codex\config.toml` (`[mcp_servers.donkey-editor]` 형식)
3. **클라이언트 반영 및 브라우저 연결 안내:**
   - 사용자에게 AI 클라이언트(또는 MCP 서버)를 새로고침/재시작하게 안내한 뒤,
   - `bridge_status` 도구를 호출하거나(또는 사용자가 `start-mcp.bat` 실행), 얻은 48자리 페어링 코드를 전달하고 브라우저에서 `https://pixeledit.pages.dev` → 상단 **Extension → Ai → MCP → 열기** → 코드 입력 → **「이 탭의 편집 허용」** 체크 → **연결**을 누르게 안내하세요.

</details>

---

## 👤 직접 설치하기 (4단계)

### 1단계. 자동 설치 (`install.bat`)
1. 압축을 원하는 폴더에 풉니다. *(참고: 나중에 폴더 위치를 옮겼다면 `install.bat`만 다시 한 번 실행하세요.)*
2. **`install.bat`** 을 더블클릭합니다.
   - **Node.js 22.18 이상**이 없으면 `winget`을 통해 자동으로 설치/업데이트를 시도합니다. *(수동 설치가 필요할 경우 안내 페이지가 열립니다.)*
   - 필요한 패키지를 설치하고, 현재 폴더 경로가 자동으로 채워진 **`mcp-config.ready.json`** 파일을 생성해 화면에 보여 줍니다.
   - 이 과정은 사용자의 기존 AI 설정 파일을 임의로 덮어쓰지 않습니다.

### 2단계. 내 AI 프로그램에 MCP 등록 (최초 1번만)
`install.bat` 창이나 폴더 안의 **`mcp-config.ready.json`** 내용을 내가 쓰는 AI 프로그램의 MCP 설정에 넣어준 뒤, **AI 프로그램을 한 번 껐다 켜 주세요(또는 MCP 새로고침)**.

```json
{
  "mcpServers": {
    "donkey-editor": {
      "command": "node",
      "args": [
        "<압축을 푼 폴더>/server.mjs",
        "--origin",
        "https://pixeledit.pages.dev"
      ]
    }
  }
}
```
> 이미 다른 MCP 서버를 쓰고 계시다면 기존 설정을 지우지 말고 `"mcpServers": { ... }` 안에 `"donkey-editor": { ... }` 블록만 추가하세요.

**주요 AI 프로그램별 설정 위치 (Windows):**
- **Antigravity**: `C:\Users\<사용자명>\.gemini\config\mcp_config.json` (또는 UI `...` → `MCP Servers` → Raw config)
- **Claude Desktop**: `C:\Users\<사용자명>\AppData\Roaming\Claude\claude_desktop_config.json`
- **Cursor**: `C:\Users\<사용자명>\.cursor\mcp.json`
- **Codex**: `C:\Users\<사용자명>\.codex\config.toml`
  ```toml
  [mcp_servers.donkey-editor]
  command = "node"
  args = ["<압축을 푼 폴더>/server.mjs", "--origin", "https://pixeledit.pages.dev"]
  ```

### 3단계. 연결 브리지 켜기 (`start-mcp.bat`)
1. **`start-mcp.bat`** 을 더블클릭합니다. *(AI 프로그램이 직접 MCP를 띄웠다면 채팅에서 "연결 코드 알려줘" 해서 바로 받을 수도 있습니다.)*
   - 같은 포트(`43129`)를 쓰던 이전 창이 있으면 종료할지 물어봅니다(`Enter` 또는 `Y`로 정리).
   - 실행되면 **48자리 연결 코드가 클립보드에 자동으로 복사**됩니다. *(작업하는 동안 창을 열어 두세요.)*

### 4단계. 웹사이트에서 연결 누르기
1. 브라우저에서 **`https://pixeledit.pages.dev`** 로 들어갑니다.
2. 상단 **Extension → Ai → MCP → 열기** 클릭
3. 연결 코드 칸에 **`Ctrl + V`** 로 붙여넣고, AI가 직접 그림을 그리게 하려면 **「이 탭의 편집 허용」** 을 체크한 뒤 **연결**을 누릅니다.
4. 브라우저가 *"로컬 네트워크 접근 권한을 허용할까요?"* 라고 물으면 **허용**을 누릅니다.

---

## 연결 후 AI에게 할 수 있는 일 (29개 도구 요약)

이제 AI 채팅창에 말로 시키면 됩니다.

- *"지금 캔버스 보고 파란 슬라임 한 마리 그려줘"*
- *"애니메이션 전 프레임 번호 시트로 보고 색만 붉은 계열로 한 번에 바꿔줘"*
- *"아틀라스 시트를 16×16 프레임으로 잘라서 6fps 애니메이션으로 만들어줘"*
- *"파티클 창 열고 빨간 불꽃 이펙트 만들어서 애니메이션 레이어로 구워줘"*

### 제공되는 29개 MCP 도구
- **연결 · 상태 · 보기 · 읽기 (4)**
  `bridge_status`, `editor_state`, `editor_preview` *(단일 프레임 PNG + 멀티프레임 번호 시트 `sheet=true`)*, `editor_read_pixels` *(RLE 정밀 픽셀 읽기)*
- **그리기 · 변환 · 선택 · 편집 · 히스토리 (8)**
  `editor_paint` *(픽셀·선·도형·채우기·RLE·색 교체 `replace`+`tolerance`·다중 `frames[]`)*, `editor_import_image` *(PNG/스프라이트 시트 고속 가져오기)*, `editor_transform` *(이동·정렬·반전·회전·외곽선)*, `editor_select` *(사각/다중 `rectangles[]`/모양/올가미/콘텐츠)*, `editor_copy`, `editor_paste` *(다중 `positions[]`/`frames[]`)*, `editor_erase`, `editor_history` *(실행취소/다시실행)*
- **캔버스 · 레이어 · 설정 · 팔레트 · UI (6)**
  `editor_new`, `editor_resize`, `editor_layer` *(시작·선택·추가·순서·FPS·재생 `play`+`fps`·일시정지·다중 프레임 삭제)*, `editor_settings`, `editor_palette` *(팔레트 관리·영역별 캔버스 색상 추출 `extract_from_canvas`)*, `editor_ui` *(인스펙터 탭·확장 창 제어)*
- **확장 기능 (5)**
  `editor_object`, `editor_tile`, `editor_sort`, `editor_grid_paper`, `editor_atlas_animation` *(스프라이트 검출·균등 그리드 분할·애니메이션 변환)*
- **파티클 시뮬레이터 (6)**
  `particle_describe`, `particle_update`, `particle_playback`, `particle_sprite_from_canvas`, `particle_bake`, `particle_config`

*(합계 `29`개: 연결 `1` + 조회/읽기 `3` + 그리기/편집 `8` + 캔버스/설정/UI `6` + 확장 `5` + 파티클 `6`)*

---

## 자주 묻는 질문

- **Q. 내 AI 프로그램이 연결이 안 됐다고 해요.**
  - 2단계에서 AI 프로그램 설정에 `donkey-editor`를 넣고 **AI 프로그램을 한 번 껐다 켰는지(또는 MCP 새로고침)** 확인해 주세요.
  - `start-mcp.bat`을 나중에 다시 켰다면 AI에게 다시 한 번 작업 지시를 하면 자동으로 새 창에 붙습니다.
- **Q. 브라우저에서 "연결 실패"가 떠요.**
  - `start-mcp.bat` 창이 켜져 있는지 확인하세요.
  - 브라우저 주소가 **`https://pixeledit.pages.dev`** 가 맞는지 확인하세요.
  - 브라우저 사이트 권한 설정에서 **로컬 네트워크 접근**이 차단되어 있지 않은지 확인하세요.
- **Q. AI가 읽기만 하고 그림을 안 그려요 (`read-only`).**
  - 웹사이트 MCP 창에서 **연결 해제**를 누른 뒤 **「이 탭의 편집 허용」** 체크박스를 켜고 다시 연결하세요.

---

## 개발자 참고
- 보안상 기본 허용 사이트는 **`https://pixeledit.pages.dev`** 1개입니다. 다른 주소를 쓰려면 `--origin http://localhost:5173` 처럼 추가하세요.
- 기본 포트는 `43129`이며, 변경이 필요하면 `--port 43130`을 전달하세요.
