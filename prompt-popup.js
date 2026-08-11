// 프롬프트 편집창 오케스트레이션.
// ST 편집창에 각 기능의 칸을 꽂고, 저장 시 후처리를 순서대로 돌린다.
// 후처리는 기능별로 격리되어 하나가 실패해도 나머지는 진행된다.
import { promptManager } from '../../../openai.js';
import { EXTENSION_NAME, QUICK_TOGGLE_ENABLED_KEY, QUICK_TOGGLE_NAME_KEY } from './constants.js';
import { applyKeywordTriggerToPrompt, loadKeywordTriggerFormForPrompt, resetKeywordTriggerDraft } from './keyword-trigger.js';
import { loadPositionSelectForPrompt, movePromptToPosition } from './prompt-position.js';
import { applyQuickToggleDataToPrompt, ensureQuickTogglePopupControls, isQuickToggleFeatureEnabled, isQuickToggleGroupFeatureEnabled, readQuickToggleForm } from './quick-toggle.js';
import { getFeatureSettings } from './settings-store.js';
import { ensureTranslateButtonInPopup } from './translate.js';
import { L } from './translations.js';

let quickPopupObserver = null;

export function loadQuickToggleFormForPrompt(promptId) {
    ensureQuickTogglePopupControls();
    loadPositionSelectForPrompt(promptId);
    ensureTranslateButtonInPopup();

    // 키워드 칸 채우기는 이 함수 안에서 제일 마지막에, 그리고 격리해서 돌린다.
    // 앞쪽에 두면 여기서 난 예외가 빠른 토글 칸을 빈 채로 남겨 버린다.
    // (이 함수는 중간에 return하는 경로가 있어 setTimeout으로 뒤로 미룬다)
    setTimeout(() => {
        try {
            loadKeywordTriggerFormForPrompt(promptId);
        } catch (e) {
            console.error(`[${EXTENSION_NAME}] keyword trigger form failed`, e);
        }
    }, 0);

    const nameInput = document.getElementById('custom_preset_quick_toggle_name');
    const enabledInput = document.getElementById('custom_preset_quick_toggle_enabled');
    const quickBlock = document.getElementById('custom_preset_quick_toggle_block');
    if (!nameInput || !enabledInput || !quickBlock) return;

    quickBlock.style.display = isQuickToggleFeatureEnabled() ? '' : 'none';

    // 고급 문법 안내는 그룹 기능을 켠 사람에게만 보여준다.
    const quickHint = document.getElementById('custom_preset_quick_toggle_hint');
    if (quickHint) {
        quickHint.textContent = isQuickToggleGroupFeatureEnabled()
            ? `${L.toggleButtonNameHint}\n${L.toggleButtonNameHintAdvanced}`
            : L.toggleButtonNameHint;
    }

    const prompt = promptManager?.getPromptById?.(promptId);
    if (!prompt) {
        nameInput.value = '';
        enabledInput.checked = false;
        return;
    }

    nameInput.value = (prompt[QUICK_TOGGLE_NAME_KEY] || '').trim();
    enabledInput.checked = !!prompt[QUICK_TOGGLE_ENABLED_KEY];
}

export function observePromptPopupChanges() {
    const saveBtn = document.getElementById('completion_prompt_manager_popup_entry_form_save');
    if (!saveBtn) return;

    // Capture values before PromptManager closes the popup
    saveBtn.addEventListener('click', () => {
        const promptId = saveBtn.dataset.pmPrompt;
        if (!promptId) return;
        const quickData = readQuickToggleForm();
        const positionSelect = document.getElementById('custom_preset_position_select');
        const selectedPosition = positionSelect?.value || '';
        // Check if this is a new prompt (not yet in promptManager) before save fires
        const isNewPrompt = !promptManager?.getPromptById?.(promptId);
        setTimeout(() => {
            // 저장 후처리는 서로 독립이다. 한 기능이 터졌다고 나머지가 통째로 날아가면
            // "빠른 토글이 저장이 안 된다" 같은 엉뚱한 증상으로 나타나므로 하나씩 격리한다.
            const step = (label, fn) => {
                try {
                    fn();
                } catch (e) {
                    console.error(`[${EXTENSION_NAME}] save step failed: ${label}`, e);
                }
            };

            // Auto-connect: if it was a new prompt and feature is enabled, link it to prompt_order
            step('auto-connect', () => {
                if (isNewPrompt && getFeatureSettings().autoConnectPrompt) {
                    const addedPrompt = promptManager?.getPromptById?.(promptId);
                    if (addedPrompt && promptManager.activeCharacter) {
                        promptManager.appendPrompt(addedPrompt, promptManager.activeCharacter);
                        promptManager.saveServiceSettings();
                        promptManager.render();
                    }
                }
            });
            step('quick-toggle', () => applyQuickToggleDataToPrompt(promptId, quickData));
            step('keyword-trigger', () => applyKeywordTriggerToPrompt(promptId));
            step('position', () => {
                if (selectedPosition) movePromptToPosition(promptId, selectedPosition);
            });
            step('auto-save', () => {
                if (getFeatureSettings().autoSavePreset) {
                    document.getElementById('update_oai_preset')?.click();
                }
            });
        }, 0);
    }, true);

    // ST의 프롬프트 되돌리기(↺)는 폼만 기본값으로 되돌린다. Triggers 선택도 전부 풀리는데
    // 우리 작업본은 그대로 남아서, 되돌린 뒤 저장하면 키워드 설정이 딸려 들어간다.
    // ST 핸들러가 폼을 먼저 비우게 두고(setTimeout) 그 뒤에 작업본을 맞춘다.
    const resetBtn = document.getElementById('completion_prompt_manager_popup_entry_form_reset');
    resetBtn?.addEventListener('click', () => {
        setTimeout(() => {
            resetKeywordTriggerDraft();
        }, 0);
    }, true);

    if (quickPopupObserver) return;

    quickPopupObserver = new MutationObserver(() => {
        loadQuickToggleFormForPrompt(saveBtn.dataset.pmPrompt);
    });
    quickPopupObserver.observe(saveBtn, {
        attributes: true,
        attributeFilter: ['data-pm-prompt'],
    });

    loadQuickToggleFormForPrompt(saveBtn.dataset.pmPrompt);
}
