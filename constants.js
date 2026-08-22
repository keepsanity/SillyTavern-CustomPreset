// 확장 전반에서 공유하는 상수 모음
export const EXTENSION_NAME = 'SillyTavern-CustomPreset';

// 프롬프트 매니저(전역/더미 캐릭터)의 prompt_order character_id
export const GLOBAL_PROMPT_CHARACTER_ID = 100001;

export const QUICK_TOGGLE_NAME_KEY = 'quick_prompt_toggle_name';
export const QUICK_TOGGLE_ENABLED_KEY = 'quick_prompt_toggle_enabled';

// 토글 이름 필드는 쉼표로 여러 그룹을 지정할 수 있다. ("약, 중, 강")
// 한 프롬프트를 여러 그룹에 동시에 넣기 위한 구분자.
export const QUICK_TOGGLE_GROUP_SEPARATOR = ',';

// 그룹 이름을 "태그::이름"으로 적으면 같은 태그를 가진 그룹끼리는 하나만 켜진다. ("강도::약")
// 기존 이름과 충돌할 가능성이 거의 없는 구분자를 쓴다.
export const QUICK_TOGGLE_SET_SEPARATOR = '::';

// 그룹 이름을 "폴더>>이름"으로 적으면 버튼 하나에 접히고, 눌러서 연 메뉴에서 개별로 켜고 끈다. ("연출>>조명")
// 세트(::)와 달리 서로 배타적이지 않아서 폴더 안 버튼은 여러 개를 동시에 켤 수 있다.
export const QUICK_TOGGLE_FOLDER_SEPARATOR = '>>';

// 프롬프트 담기(캡처)에서 이름 → 매크로 치환 대상.
// 1글자 이름은 본문 아무 데나 걸려서 오탐이 심하므로 건너뛴다.
export const CAPTURE_MIN_NAME_LENGTH = 2;

// 키워드 트리거 설정이 붙는 프롬프트 필드. 프리셋에 같이 저장되고 공유된다.
export const KEYWORD_TRIGGER_KEY = 'keyword_trigger';

// Triggers 셀렉트에 끼워넣는 가상 옵션 값.
// 저장 직전에 injection_trigger에서 다시 빼내고 KEYWORD_TRIGGER_KEY로 옮기기 때문에,
// 확장이 없는 환경에서 프리셋을 열어도 "어떤 생성타입에도 안 걸리는 죽은 프롬프트"가 되지 않는다.
export const KEYWORD_TRIGGER_OPTION = 'keyword';

// 스캔 깊이를 비워두면 확장 설정의 전역값을 쓴다.
export const KEYWORD_TRIGGER_DEFAULT_DEPTH = 2;
export const KEYWORD_TRIGGER_MAX_DEPTH = 999;

export const FEATURE_DEFAULTS = {
    showPresetCustomizerButton: true,
    showQuickPromptToggleFeature: true,
    showQuickPromptToggleCollapseFeature: true,
    // 그룹 관리 UI와 고급 문법 안내만 가린다. 이미 만들어진 그룹 버튼은 이 값과 무관하게 동작한다.
    showQuickToggleGroupFeature: false,
    quickPromptToggleBarCollapsed: false,
    showPromptPositionFeature: true,
    showTogglePresetFeature: true,
    showLinkedPresetFeature: true,
    autoSavePreset: false,
    autoConnectPrompt: true,
    showTranslateFeature: false,
    showPromptPreviewFeature: true,
    // 채팅에서 텍스트를 집어 프리셋 프롬프트로 담는 기능 (기본 꺼짐)
    showPromptCaptureFeature: false,
    promptCaptureFromCodeBlock: true,
    promptCaptureFromSelection: true,
    // 캡처 창을 열 때 {{user}}/{{char}} 치환 체크박스의 초기 상태
    promptCaptureMacroDefault: true,
    // 프롬프트 키워드 트리거 (기본 꺼짐)
    showKeywordTriggerFeature: false,
    // 프롬프트별로 따로 지정하지 않았을 때 쓰는 스캔 깊이 (최근 메시지 N개)
    keywordTriggerScanDepth: KEYWORD_TRIGGER_DEFAULT_DEPTH,
    translationProfileId: '',
    translationPromptTemplate: '',
    translations: {},
};
