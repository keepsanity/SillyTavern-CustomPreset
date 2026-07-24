// 확장 전반에서 공유하는 상수 모음
export const EXTENSION_NAME = 'SillyTavern-CustomPreset';

// 프롬프트 매니저(전역/더미 캐릭터)의 prompt_order character_id
export const GLOBAL_PROMPT_CHARACTER_ID = 100001;

export const QUICK_TOGGLE_NAME_KEY = 'quick_prompt_toggle_name';
export const QUICK_TOGGLE_ENABLED_KEY = 'quick_prompt_toggle_enabled';

// 토글 이름 필드는 쉼표로 여러 그룹을 지정할 수 있다. ("약, 중, 강")
// 한 프롬프트를 여러 그룹에 동시에 넣기 위한 구분자.
export const QUICK_TOGGLE_GROUP_SEPARATOR = ',';

// 그룹 이름을 "세트::이름"으로 적으면 같은 세트의 그룹끼리는 하나만 켜진다. ("강도::약")
// 기존 이름과 충돌할 가능성이 거의 없는 구분자를 쓴다.
export const QUICK_TOGGLE_SET_SEPARATOR = '::';

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
    translationProfileId: '',
    translationPromptTemplate: '',
    translations: {},
};
