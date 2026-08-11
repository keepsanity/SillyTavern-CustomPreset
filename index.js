// 확장 진입점. 초기화 순서와 ST 이벤트 구독만 담당한다.
// 실제 기능은 전부 기능별 모듈에 있고, 이 파일은 그것들을 조립하기만 한다.
//
// 레이어 구조 (아래에서 위로, import는 항상 위 -> 아래 한 방향)
//   L0  constants / translations / settings-store / preset-utils / shared
//   L1  keyword-trigger, quick-toggle, toggle-preset, linked-preset, capture,
//       translate, preview-intercept, prompt-position, prompt-list
//   L2  customizer-panel, prompt-popup, settings-ui
//   L3  index.js (이 파일)
// 아래 레이어가 위를 부르면 순환이 생기므로 하지 않는다.
import { eventSource, event_types } from '../../../../script.js';
import { EXTENSION_NAME } from './constants.js';
import { getActivePresetName } from './preset-utils.js';
import { ensureKeywordTriggerPatch } from './keyword-trigger.js';
import { ensureQuickToggleCollapseButton, ensureQuickTogglePopupControls, renderQuickToggleButtons } from './quick-toggle.js';
import { populateTogglePresetSelect, reapplyActiveTogglePreset } from './toggle-preset.js';
import { applyLinkedPresetForChat, createLinkedPresetMenuItem } from './linked-preset.js';
import { ensureCodeBlockCaptureButtons, hideCaptureMenu, hideSelectionCaptureButton } from './capture.js';
import { bindInterceptListeners, createPromptInterceptMenuItem, observePromptManagerHeader, updatePromptInterceptMenuState } from './preview-intercept.js';
import { createUI, isCustomizerPanelOpen, populatePresetSelect } from './customizer-panel.js';
import { observePromptPopupChanges } from './prompt-popup.js';
import { applyFeatureVisibility, createExtensionSettingsMenu } from './settings-ui.js';

/**
 * Initialize the extension
 */
async function init() {
    console.log(`[${EXTENSION_NAME}] Initializing...`);

    // Wait for SillyTavern to be ready
    if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
        console.warn(`[${EXTENSION_NAME}] SillyTavern not ready, retrying in 500ms...`);
        setTimeout(init, 500);
        return;
    }

    // Wait for DOM to be ready
    let attempts = 0;
    const maxAttempts = 20;

    while (attempts < maxAttempts) {
        if (document.getElementById('completion_prompt_manager')) {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        attempts++;
    }

    if (!document.getElementById('completion_prompt_manager')) {
        console.warn(`[${EXTENSION_NAME}] completion_prompt_manager not found after waiting`);
        return;
    }

    createUI();
    createExtensionSettingsMenu();
    createLinkedPresetMenuItem();
    // createPromptPreviewMenuItem(); // 조립(dry-run) 미리보기 — 일단 비활성화, 인터셉트만 사용
    createPromptInterceptMenuItem();
    bindInterceptListeners();
    updatePromptInterceptMenuState();
    observePromptManagerHeader();
    ensureQuickTogglePopupControls();
    observePromptPopupChanges();
    ensureKeywordTriggerPatch();
    ensureQuickToggleCollapseButton();
    applyFeatureVisibility();
    renderQuickToggleButtons();
    populateTogglePresetSelect(getActivePresetName());
    // 재시작 시 커넥션/프리셋 재적용으로 토글이 프리셋 원본으로 덮여쓰이는 경우 대비
    reapplyActiveTogglePreset(getActivePresetName());

    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        if (isCustomizerPanelOpen()) populatePresetSelect();
        const presetName = getActivePresetName();
        populateTogglePresetSelect(presetName);
        reapplyActiveTogglePreset(presetName);
        renderQuickToggleButtons();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        renderQuickToggleButtons();
        applyLinkedPresetForChat();
        hideSelectionCaptureButton();
        hideCaptureMenu();
        ensureCodeBlockCaptureButtons();
    });

    console.log(`[${EXTENSION_NAME}] Initialized successfully`);
}

// Initialize when jQuery is ready
jQuery(async () => {
    await init();
});
