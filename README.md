# SillyTavern-CustomPreset

A SillyTavern extension for managing and customizing prompt presets.

## Features

### Preset Customizer
- Browse all prompts in the current preset with an expandable panel
- View prompt content, role, and link status at a glance
- Search prompts by name, role, or content
- Copy prompt content to clipboard
- Add prompts to the prompt manager directly from the list

### Quick Prompt Toggle
- Assign toggle buttons to individual prompts for quick enable/disable
- Toggle buttons appear above the input area for fast access
- Collapsible toggle bar to save screen space

### Toggle Group (advanced — enable it in settings)
- Bundle several prompts under one button — clicking it turns them all on or off
- A prompt can belong to multiple groups (e.g. shared prompts 1 & 2 in *Low* / *Mid* / *High*)
- Manage groups visually: create a group, then pick its prompts with checkboxes
- Buttons show three states: **on** (all members enabled), **partial** (dashed — only some enabled), **off**
- Optional **tag**: buttons sharing a tag behave like radio buttons. Switching from *Low* to *Mid*
  turns off only what is not shared, so shared prompts stay on. The tag is not shown on the button
- Groups may share prompts — turning one group off never breaks another group that is still on
- Group configuration is stored inside the preset, so it travels with an exported/shared preset
- Advanced: the toggle name field accepts `Low, Mid, High` (comma = multiple groups) and
  `tag::name` (e.g. `level::Low`)

### Prompt Position
- Choose where to insert a prompt when adding it via the "+" button
- Change prompt position in the prompt editor (applied on save)

### Toggle Preset
- Save prompt on/off combinations as named presets
- Quickly switch between different toggle configurations within the same preset
- Create, rename, delete, and overwrite toggle presets
- "Default" toggle preset is automatically created and cannot be deleted

### Linked Preset
- Assign a preset (and optionally a toggle preset) to each chat
- When entering a chat, the linked preset is automatically applied
- Manage linked presets via the extensions menu (wand button)

### Auto-save Preset
- Automatically saves the preset when saving a prompt edit
- No need to manually click the save button at the top

### Capture Prompts from Chat (off by default)
- A capture button next to the copy button on every code block in a chat message
- Select text inside a chat message and a floating capture button appears at the right edge of the screen,
  level with the start of the selection — clear of the OS copy/paste callout and of other extensions'
  selection buttons, which sit near the selection's centre and end
- Both open a small menu: **append to an existing prompt**, **replace an existing prompt**, **add as a new prompt**
- When appending, choose the spot: below, above, or **at the cursor** — the target prompt's content is shown
  in an editable box, so you click where it should go (and can fix the existing text while you are there)
- The capture dialog can convert the persona and character names into `{{user}}` / `{{char}}`
  (group chats convert every member to `{{char}}`). The checkbox is per-capture and the text stays editable
- Names shorter than 2 characters are skipped — they match too much text to be safe

## Settings

All features can be toggled in **Extensions > Custom Preset Manager**:

| Setting | Description |
|---|---|
| Show Preset Customize Button | Show/hide the "Customize Preset" button in the prompt manager |
| Show Quick Prompt Toggle | Show/hide toggle buttons in the editor and above the input |
| Enable Collapse Toggle | Show/hide the collapse button for the toggle bar |
| Toggle Group (advanced) | Show the "Manage Groups" feature (off by default). Existing group buttons work either way |
| Enable Position Select | Enable position selection when adding/editing prompts |
| Show Toggle Preset | Show/hide the toggle preset feature |
| Show Linked Preset | Enable per-chat automatic preset switching |
| Auto-save Preset | Automatically save the preset when saving a prompt edit |
| Capture Prompts from Chat | Capture code blocks / selected text from chat into a preset prompt (off by default) |

---

# SillyTavern-CustomPreset

SillyTavern용 프롬프트 프리셋 관리 확장 기능입니다.

## 기능

### 프리셋 커스터마이저
- 현재 프리셋의 모든 프롬프트를 펼쳐볼 수 있는 패널
- 프롬프트 내용, role, 연결 상태를 한눈에 확인
- 이름, role, 내용으로 프롬프트 검색
- 프롬프트 내용 클립보드 복사
- 목록에서 바로 프롬프트 매니저에 추가

### 빠른 프롬프트 토글
- 개별 프롬프트에 토글 버튼을 지정하여 빠르게 켜고 끌 수 있음
- 입력창 위에 토글 버튼 표시
- 토글 바 접기/펼치기 지원

### 토글 그룹 (고급 — 설정에서 켜야 보임)
- 여러 프롬프트를 버튼 하나로 묶어서 한 번에 켜고 끔
- 한 프롬프트가 여러 그룹에 동시에 소속 가능 (예: 공용 프롬프트 1·2번을 *약*/*중*/*강* 세 그룹에 모두)
- "그룹 관리" 창에서 그룹을 만들고 넣을 프롬프트를 체크박스로 선택
- 버튼은 3가지 상태로 표시: **켜짐**(멤버 전부 on), **일부 켜짐**(점선 — 공용만 켜진 경우), **꺼짐**
- **태그**(선택): 같은 태그를 가진 버튼끼리는 하나만 켜짐. *약* → *중* 전환 시 공용이 아닌 프롬프트만
  꺼지므로 공용 프롬프트는 켜진 채로 유지되고 한 번의 클릭으로 버전이 바뀜. 태그는 버튼에 표시되지 않음
- 그룹끼리 프롬프트를 공유해도, 한 그룹을 꺼서 아직 켜져 있는 다른 그룹이 무너지지 않음
- 그룹 구성은 프리셋 안에 저장되므로 프리셋을 공유하면 그룹도 그대로 따라감
- 직접 입력: 토글 이름 칸에 `약, 중, 강`처럼 쉼표로 여러 그룹 지정, `태그::이름`(예: `강도::약`)으로 지정

### 프롬프트 위치 지정
- "+" 버튼으로 프롬프트 추가 시 삽입 위치 선택 가능
- 프롬프트 편집에서 위치 변경 (저장 시 적용)

### 토글 프리셋
- 프롬프트 on/off 조합을 이름을 붙여 저장
- 같은 프리셋 안에서 다른 토글 구성으로 빠르게 전환
- 토글 프리셋 생성, 이름 변경, 삭제, 덮어쓰기 가능
- "기본" 토글 프리셋은 자동 생성되며 삭제 불가

### 연결 프리셋
- 채팅방마다 프리셋(및 토글 프리셋)을 지정 가능
- 채팅방에 진입하면 지정된 프리셋으로 자동 전환
- 확장 메뉴(지팡이 버튼)에서 연결 프리셋 관리

### 프롬프트 자동 저장
- 프롬프트 수정 저장 시 프리셋도 자동으로 저장
- 상단 저장 버튼을 따로 누를 필요 없음

### 채팅에서 프롬프트 담기 (기본 꺼짐)
- 채팅 메시지 코드블럭의 복사 버튼 옆에 담기 버튼 추가
- 채팅 메시지 안에서 텍스트를 드래그하면 **화면 오른쪽 끝, 선택이 시작되는 줄 높이**에 담기 버튼이 뜸.
  OS 복사·붙여넣기 메뉴(선택 영역 가로 중앙)와도, 다른 확장의 선택 버튼(선택 끝 근처)과도 자리가 갈림
- 둘 다 누르면 메뉴 세 개: **기존 프롬프트에 추가**, **기존 프롬프트 대체**, **새 프롬프트로 추가**
- 추가할 때 붙일 위치를 맨 아래 / 맨 위 / **커서 위치** 중에 선택. 대상 프롬프트 내용이 편집 가능한 칸으로
  뜨므로 원하는 자리를 클릭해서 지정하면 되고, 그 김에 기존 내용도 바로 고칠 수 있음
- 담기 창에서 페르소나/캐릭터 이름을 `{{user}}` / `{{char}}` 매크로로 변환 가능
  (그룹챗은 멤버 전원을 `{{char}}`로 변환). 체크박스는 매번 바꿀 수 있고 내용도 직접 수정 가능
- 1글자 이름은 본문 아무 데나 걸려서 변환 대상에서 제외

## 설정

**확장 기능 > 커스텀 프리셋 매니저**에서 모든 기능을 토글할 수 있습니다:

| 설정 | 설명 |
|---|---|
| 프리셋 커스텀하기 버튼 표시 | 프롬프트 매니저 상단의 버튼 표시/숨김 |
| 빠른 프롬프트 토글 표시 | 편집의 토글 항목과 입력창 위 토글 버튼 표시/숨김 |
| 빠른 토글 접기기능 활성화 | 토글 바 접기/펼치기 버튼 표시 |
| 토글 그룹 기능 (고급) | "그룹 관리" 기능 표시 (기본 꺼짐). 꺼도 이미 만든 그룹 버튼은 동작 |
| 프롬프트 위치 정하기 | 프롬프트 추가/편집 시 위치 선택 기능 활성화 |
| 토글 프리셋 표시 | 토글 프리셋 기능 표시/숨김 |
| 연결 프리셋 표시 | 채팅방별 프리셋 자동 전환 기능 사용 |
| 프롬프트 자동 저장 | 프롬프트 수정 저장 시 프리셋 자동 저장 |
| 채팅에서 프롬프트 담기 | 코드블럭/드래그한 텍스트를 프리셋 프롬프트로 담기 (기본 꺼짐) |


---

## License
This project is licensed under the AGPL-3.0 License.

The prompt inspection feature is adapted from
[SillyTavern/Extension-PromptInspector](https://github.com/SillyTavern/Extension-PromptInspector) (AGPL-3.0).
