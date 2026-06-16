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

## Settings

All features can be toggled in **Extensions > Custom Preset Manager**:

| Setting | Description |
|---|---|
| Show Preset Customize Button | Show/hide the "Customize Preset" button in the prompt manager |
| Show Quick Prompt Toggle | Show/hide toggle buttons in the editor and above the input |
| Enable Collapse Toggle | Show/hide the collapse button for the toggle bar |
| Enable Position Select | Enable position selection when adding/editing prompts |
| Show Toggle Preset | Show/hide the toggle preset feature |
| Show Linked Preset | Enable per-chat automatic preset switching |
| Auto-save Preset | Automatically save the preset when saving a prompt edit |

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

## 설정

**확장 기능 > 커스텀 프리셋 매니저**에서 모든 기능을 토글할 수 있습니다:

| 설정 | 설명 |
|---|---|
| 프리셋 커스텀하기 버튼 표시 | 프롬프트 매니저 상단의 버튼 표시/숨김 |
| 빠른 프롬프트 토글 표시 | 편집의 토글 항목과 입력창 위 토글 버튼 표시/숨김 |
| 빠른 토글 접기기능 활성화 | 토글 바 접기/펼치기 버튼 표시 |
| 프롬프트 위치 정하기 | 프롬프트 추가/편집 시 위치 선택 기능 활성화 |
| 토글 프리셋 표시 | 토글 프리셋 기능 표시/숨김 |
| 연결 프리셋 표시 | 채팅방별 프리셋 자동 전환 기능 사용 |
| 프롬프트 자동 저장 | 프롬프트 수정 저장 시 프리셋 자동 저장 |


---

## License
This project is licensed under the AGPL-3.0 License.

The prompt inspection feature is adapted from
[SillyTavern/Extension-PromptInspector](https://github.com/SillyTavern/Extension-PromptInspector) (AGPL-3.0).
