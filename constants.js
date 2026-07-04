// 확장 전반에서 공유하는 상수 모음
export const EXTENSION_NAME = 'SillyTavern-CustomPreset';

// 프롬프트 매니저(전역/더미 캐릭터)의 prompt_order character_id
export const GLOBAL_PROMPT_CHARACTER_ID = 100001;

export const QUICK_TOGGLE_NAME_KEY = 'quick_prompt_toggle_name';
export const QUICK_TOGGLE_ENABLED_KEY = 'quick_prompt_toggle_enabled';

export const FEATURE_DEFAULTS = {
    showPresetCustomizerButton: true,
    showQuickPromptToggleFeature: true,
    showQuickPromptToggleCollapseFeature: true,
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
