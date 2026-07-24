import { openai_settings, openai_setting_names, oai_settings, promptManager } from '../../../openai.js';
import { uuidv4 } from '../../../utils.js';
import { extension_settings, saveMetadataDebounced } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced, chat_metadata, Generate, main_api, stopGeneration } from '../../../../script.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { L } from './translations.js';
import { EXTENSION_NAME, GLOBAL_PROMPT_CHARACTER_ID, QUICK_TOGGLE_NAME_KEY, QUICK_TOGGLE_ENABLED_KEY, QUICK_TOGGLE_GROUP_SEPARATOR, QUICK_TOGGLE_SET_SEPARATOR, FEATURE_DEFAULTS } from './constants.js';

let isPanelOpen = false;
let quickPopupObserver = null;
let quickToggleButtonListenerAttached = false;

function getSearchKeyword() {
    const searchInput = document.getElementById('custom_preset_search_input');
    return (searchInput?.value || '').trim().toLowerCase();
}

function matchesSearch(prompt, keyword) {
    if (!keyword) return true;
    const name = (prompt.name || '').toLowerCase();
    const role = (prompt.role || '').toLowerCase();
    const content = (prompt.content || '').toLowerCase();
    return name.includes(keyword) || role.includes(keyword) || content.includes(keyword);
}

function triggerSearch() {
    const select = document.getElementById('custom_preset_select');
    if (!select) return;
    const preset = getPresetByName(select.value);
    renderPromptList(preset);
}

function clearSearch() {
    const searchInput = document.getElementById('custom_preset_search_input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    triggerSearch();
}

function getFeatureSettings() {
    if (!extension_settings[EXTENSION_NAME] || typeof extension_settings[EXTENSION_NAME] !== 'object') {
        extension_settings[EXTENSION_NAME] = {};
    }
    const settings = extension_settings[EXTENSION_NAME];
    for (const key of Object.keys(FEATURE_DEFAULTS)) {
        if (!(key in settings)) {
            settings[key] = FEATURE_DEFAULTS[key];
        }
    }
    return settings;
}

function saveFeatureSettings() {
    extension_settings[EXTENSION_NAME] = getFeatureSettings();
    saveSettingsDebounced();
}

// ========== Toggle Preset Data Helpers ==========

function getTogglePresetsStorage() {
    const settings = getFeatureSettings();
    if (!settings.togglePresets || typeof settings.togglePresets !== 'object') {
        settings.togglePresets = {};
    }
    return settings.togglePresets;
}

function getActiveTogglePresetTracker() {
    const settings = getFeatureSettings();
    if (!settings.activeTogglePreset || typeof settings.activeTogglePreset !== 'object') {
        settings.activeTogglePreset = {};
    }
    return settings.activeTogglePreset;
}

function getTogglePresetsForPreset(presetName) {
    if (!presetName) return {};
    const storage = getTogglePresetsStorage();
    if (!storage[presetName]) {
        storage[presetName] = {
            'default': captureCurrentToggleState(),
        };
        saveFeatureSettings();
    }
    return storage[presetName];
}

function getActiveTogglePresetName(presetName) {
    const tracker = getActiveTogglePresetTracker();
    return tracker[presetName] || 'default';
}

function setActiveTogglePresetName(presetName, togglePresetName) {
    const tracker = getActiveTogglePresetTracker();
    tracker[presetName] = togglePresetName;
    saveFeatureSettings();
}

// ========== Toggle Preset Snapshot ==========

function captureCurrentToggleState() {
    const serviceSettings = promptManager?.serviceSettings;
    if (!serviceSettings?.prompt_order) return {};
    const entry = serviceSettings.prompt_order.find(e => e.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    if (!entry?.order) return {};
    const state = {};
    for (const item of entry.order) {
        state[item.identifier] = !!item.enabled;
    }
    return state;
}

function applyTogglePresetSnapshot(snapshot) {
    const serviceSettings = promptManager?.serviceSettings;
    if (!serviceSettings?.prompt_order) return;
    const entry = serviceSettings.prompt_order.find(e => e.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    if (!entry?.order) return;
    let changed = false;
    for (const item of entry.order) {
        if (snapshot.hasOwnProperty(item.identifier)) {
            const desired = !!snapshot[item.identifier];
            if (item.enabled !== desired) {
                item.enabled = desired;
                changed = true;
            }
        }
    }
    if (changed) {
        promptManager.saveServiceSettings();
        promptManager.render();
    }
    renderQuickToggleButtons();
}

// ST가 프리셋을 (재)적용하면 prompt_order를 프리셋 원본 on/off로 덮어쓴다.
// 활성 토글 프리셋이 default가 아니면 그 스냅샷을 다시 씌워 리셋을 막는다.
// (default = "프리셋 원본 그대로" 이므로 건너뜀 → 토글 프리셋 안 쓰는 사용자는 영향 없음)
function reapplyActiveTogglePreset(presetName) {
    if (!presetName) return;
    if (getFeatureSettings().showTogglePresetFeature === false) return;
    const active = getActiveTogglePresetName(presetName);
    if (active === 'default') return;
    const presets = getTogglePresetsForPreset(presetName);
    if (presets[active]) {
        applyTogglePresetSnapshot(presets[active]);
    }
}

// ========== Toggle Preset CRUD ==========

function createTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const name = prompt(L.togglePresetNew);
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const presets = getTogglePresetsForPreset(presetName);
    if (presets[trimmed]) {
        toastr.warning(L.togglePresetNameExists);
        return;
    }
    presets[trimmed] = captureCurrentToggleState();
    setActiveTogglePresetName(presetName, trimmed);
    saveFeatureSettings();
    populateTogglePresetSelect(presetName);
    toastr.success(L.togglePresetCreated(trimmed));
}

function renameTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const current = getActiveTogglePresetName(presetName);
    if (current === 'default') {
        toastr.warning(L.togglePresetCannotDeleteDefault);
        return;
    }
    const newName = prompt(L.togglePresetRename, current);
    if (!newName || !newName.trim() || newName.trim() === current) return;
    const trimmed = newName.trim();
    const presets = getTogglePresetsForPreset(presetName);
    if (presets[trimmed]) {
        toastr.warning(L.togglePresetNameExists);
        return;
    }
    presets[trimmed] = presets[current];
    delete presets[current];
    setActiveTogglePresetName(presetName, trimmed);
    saveFeatureSettings();
    populateTogglePresetSelect(presetName);
    toastr.success(L.togglePresetRenamed(current, trimmed));
}

function deleteTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const current = getActiveTogglePresetName(presetName);
    if (current === 'default') {
        toastr.warning(L.togglePresetCannotDeleteDefault);
        return;
    }
    if (!confirm(L.togglePresetDeleteConfirm(current))) return;
    const presets = getTogglePresetsForPreset(presetName);
    delete presets[current];
    setActiveTogglePresetName(presetName, 'default');
    saveFeatureSettings();
    populateTogglePresetSelect(presetName);
    if (presets['default']) {
        applyTogglePresetSnapshot(presets['default']);
    }
    toastr.success(L.togglePresetDeleted(current));
}

function saveCurrentStateToTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const current = getActiveTogglePresetName(presetName);
    const presets = getTogglePresetsForPreset(presetName);
    presets[current] = captureCurrentToggleState();
    saveFeatureSettings();
    toastr.success(L.togglePresetSaved(current === 'default' ? L.togglePresetDefault : current));
}

// ========== Toggle Preset UI ==========

function populateTogglePresetSelect(presetName) {
    const select = document.getElementById('custom_preset_toggle_preset_select');
    if (!select) return;
    select.innerHTML = '';
    if (!presetName) {
        const option = document.createElement('option');
        option.value = 'default';
        option.textContent = L.togglePresetDefault;
        select.appendChild(option);
        return;
    }
    const presets = getTogglePresetsForPreset(presetName);
    const active = getActiveTogglePresetName(presetName);
    const names = Object.keys(presets);
    const sorted = ['default', ...names.filter(n => n !== 'default').sort()];
    for (const name of sorted) {
        if (!presets[name]) continue;
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name === 'default' ? L.togglePresetDefault : name;
        if (name === active) option.selected = true;
        select.appendChild(option);
    }
}

function onTogglePresetSelectChange() {
    const select = document.getElementById('custom_preset_toggle_preset_select');
    if (!select) return;
    const presetName = getActivePresetName();
    if (!presetName) return;
    const toggleName = select.value;
    setActiveTogglePresetName(presetName, toggleName);
    const presets = getTogglePresetsForPreset(presetName);
    const snapshot = presets[toggleName];
    if (snapshot) {
        applyTogglePresetSnapshot(snapshot);
    }
    // Re-render prompt list using the panel's selected preset
    const panelSelect = document.getElementById('custom_preset_select');
    if (panelSelect) {
        renderPromptList(getPresetByName(panelSelect.value));
    }
}

function createTogglePresetUI() {
    const section = document.createElement('div');
    section.id = 'custom_preset_toggle_preset_section';

    const label = document.createElement('label');
    label.textContent = L.togglePresetLabel;
    label.style.display = 'block';
    label.style.marginBottom = '5px';

    const row = document.createElement('div');
    row.className = 'custom_preset_toggle_preset_row';

    const select = document.createElement('select');
    select.id = 'custom_preset_toggle_preset_select';
    select.className = 'text_pole';
    select.addEventListener('change', onTogglePresetSelectChange);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'menu_button';
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
    saveBtn.title = L.togglePresetSave;
    saveBtn.addEventListener('click', saveCurrentStateToTogglePreset);

    const editBtn = document.createElement('button');
    editBtn.className = 'menu_button';
    editBtn.innerHTML = '<i class="fa-solid fa-pencil"></i>';
    editBtn.title = L.togglePresetRenameTitle;
    editBtn.addEventListener('click', renameTogglePreset);

    const addBtn = document.createElement('button');
    addBtn.className = 'menu_button';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    addBtn.title = L.togglePresetNewTitle;
    addBtn.addEventListener('click', createTogglePreset);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'menu_button';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.addEventListener('click', deleteTogglePreset);

    row.appendChild(select);
    row.appendChild(saveBtn);
    row.appendChild(editBtn);
    row.appendChild(addBtn);
    row.appendChild(deleteBtn);

    section.appendChild(label);
    section.appendChild(row);
    return section;
}

function isQuickToggleFeatureEnabled() {
    return getFeatureSettings().showQuickPromptToggleFeature !== false;
}

function isQuickToggleCollapseFeatureEnabled() {
    return getFeatureSettings().showQuickPromptToggleCollapseFeature !== false;
}

function isQuickToggleGroupFeatureEnabled() {
    return isQuickToggleFeatureEnabled() && getFeatureSettings().showQuickToggleGroupFeature === true;
}

function isPromptPositionFeatureEnabled() {
    return getFeatureSettings().showPromptPositionFeature !== false;
}

function isQuickToggleBarCollapsed() {
    return getFeatureSettings().quickPromptToggleBarCollapsed === true;
}

function setQuickToggleBarCollapsed(collapsed) {
    const settings = getFeatureSettings();
    settings.quickPromptToggleBarCollapsed = !!collapsed;
    saveFeatureSettings();
}

function getCurrentPresetName() {
    if (oai_settings?.preset_settings_openai) {
        return oai_settings.preset_settings_openai;
    }
    const select = document.getElementById('custom_preset_select');
    return select?.value || '';
}

function getCurrentPreset() {
    const presetName = getCurrentPresetName();
    if (!presetName) return null;
    return getPresetByName(presetName);
}

function getActivePromptManagerPreset() {
    const serviceSettings = promptManager?.serviceSettings;
    if (serviceSettings?.prompts && serviceSettings?.prompt_order) {
        return serviceSettings;
    }
    return getCurrentPreset();
}

/**
 * Get all preset names
 * @returns {string[]} Array of preset names
 */
function getPresetNames() {
    return Object.keys(openai_setting_names);
}

/**
 * Get preset by name
 * @param {string} name - Preset name
 * @returns {object|null} Preset object or null
 */
function getPresetByName(name) {
    const index = openai_setting_names[name];
    if (index === undefined) return null;
    return openai_settings[index];
}

function ensureQuickTogglePopupControls() {
    const orderBlock = document.getElementById('completion_prompt_manager_order_block');
    if (!orderBlock || document.getElementById('custom_preset_quick_toggle_block')) return;

    const baseRow = orderBlock.parentElement;
    if (!baseRow) return;

    const quickRow = document.createElement('div');
    quickRow.id = 'custom_preset_quick_toggle_row_container';
    quickRow.className = 'flex-container flexFlowColumn gap10px';

    const quickBlock = document.createElement('div');
    quickBlock.id = 'custom_preset_quick_toggle_block';
    quickBlock.className = 'completion_prompt_manager_popup_entry_form_control flex1';

    const title = document.createElement('label');
    title.textContent = L.quickPromptToggle;
    title.style.display = 'block';
    title.style.marginBottom = '5px';

    const row = document.createElement('div');
    row.className = 'custom_preset_quick_toggle_row';

    const nameInput = document.createElement('input');
    nameInput.id = 'custom_preset_quick_toggle_name';
    nameInput.className = 'text_pole';
    nameInput.type = 'text';
    nameInput.placeholder = L.toggleButtonName;

    const enableLabel = document.createElement('label');
    enableLabel.className = 'checkbox_label custom_preset_quick_toggle_checkbox';
    enableLabel.title = L.checkToShowToggle;

    const enableCheckbox = document.createElement('input');
    enableCheckbox.id = 'custom_preset_quick_toggle_enabled';
    enableCheckbox.type = 'checkbox';

    const enableText = document.createElement('span');
    enableText.textContent = L.use;

    enableLabel.appendChild(enableCheckbox);
    enableLabel.appendChild(enableText);
    row.appendChild(nameInput);
    row.appendChild(enableLabel);

    const quickHint = document.createElement('small');
    quickHint.id = 'custom_preset_quick_toggle_hint';
    quickHint.className = 'notes';
    quickHint.textContent = L.toggleButtonNameHint;
    quickHint.style.opacity = '0.6';
    quickHint.style.marginTop = '3px';
    quickHint.style.display = 'block';
    quickHint.style.whiteSpace = 'pre-line';

    quickBlock.appendChild(title);
    quickBlock.appendChild(row);
    quickBlock.appendChild(quickHint);

    // Position select block
    const positionBlock = document.createElement('div');
    positionBlock.id = 'custom_preset_position_block';
    positionBlock.className = 'completion_prompt_manager_popup_entry_form_control flex1';

    const positionTitle = document.createElement('label');
    positionTitle.textContent = L.promptPosition;
    positionTitle.style.display = 'block';
    positionTitle.style.marginBottom = '5px';

    const positionSelect = document.createElement('select');
    positionSelect.id = 'custom_preset_position_select';
    positionSelect.className = 'text_pole';

    const positionHint = document.createElement('small');
    positionHint.className = 'notes';
    positionHint.textContent = L.promptPositionHint;
    positionHint.style.opacity = '0.6';
    positionHint.style.marginBottom = '3px';

    positionBlock.appendChild(positionTitle);
    positionBlock.appendChild(positionHint);
    positionBlock.appendChild(positionSelect);

    quickRow.appendChild(positionBlock);
    quickRow.appendChild(quickBlock);
    baseRow.insertAdjacentElement('afterend', quickRow);

}

function readQuickToggleForm() {
    const nameInput = document.getElementById('custom_preset_quick_toggle_name');
    const enabledInput = document.getElementById('custom_preset_quick_toggle_enabled');
    return {
        name: (nameInput?.value || '').trim(),
        enabled: !!enabledInput?.checked,
    };
}

function loadQuickToggleFormForPrompt(promptId) {
    ensureQuickTogglePopupControls();
    loadPositionSelectForPrompt(promptId);
    ensureTranslateButtonInPopup();

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

function loadPositionSelectForPrompt(promptId) {
    const select = document.getElementById('custom_preset_position_select');
    const positionBlock = document.getElementById('custom_preset_position_block');
    if (!select) return;

    if (positionBlock) {
        positionBlock.style.display = isPromptPositionFeatureEnabled() ? '' : 'none';
    }

    select.innerHTML = '';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = L.selectPosition;
    select.appendChild(defaultOption);

    if (!promptId) {
        select.disabled = true;
        return;
    }

    const preset = getActivePromptManagerPreset();
    if (!preset) {
        select.disabled = true;
        return;
    }

    const promptOrderEntry = preset.prompt_order?.find(entry => entry.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    if (!promptOrderEntry?.order) {
        select.disabled = true;
        return;
    }

    const isCurrentLinked = promptOrderEntry.order.some(item => item.identifier === promptId);
    const isNewPrompt = !promptManager?.getPromptById?.(promptId);
    if (!isCurrentLinked && !(isNewPrompt && getFeatureSettings().autoConnectPrompt)) {
        select.disabled = true;
        return;
    }

    select.disabled = false;

    const linkedPrompts = getOrderedPrompts(preset).filter(({ isLinked }) => isLinked);
    let currentAboveIdentifier = '';
    const idx = promptOrderEntry.order.findIndex(item => item.identifier === promptId);
    if (idx > 0) {
        currentAboveIdentifier = promptOrderEntry.order[idx - 1].identifier;
    }

    linkedPrompts.forEach(({ prompt }) => {
        if (prompt.identifier === promptId) return;
        const option = document.createElement('option');
        option.value = prompt.identifier;
        option.textContent = prompt.name;
        if (prompt.identifier === currentAboveIdentifier) {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

function applyQuickToggleDataToPrompt(promptId, quickData) {
    const prompt = promptManager?.getPromptById?.(promptId);
    if (!prompt) return;
    // 쉼표 다중 입력을 정규화해서 저장한다. ("약 ,중,,강" → "약, 중, 강")
    prompt[QUICK_TOGGLE_NAME_KEY] = formatQuickToggleNames(parseQuickToggleNames(quickData.name));
    prompt[QUICK_TOGGLE_ENABLED_KEY] = !!quickData.enabled;
    promptManager.saveServiceSettings?.();
    renderQuickToggleButtons();
}

function observePromptPopupChanges() {
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
            // Auto-connect: if it was a new prompt and feature is enabled, link it to prompt_order
            if (isNewPrompt && getFeatureSettings().autoConnectPrompt) {
                const addedPrompt = promptManager?.getPromptById?.(promptId);
                if (addedPrompt && promptManager.activeCharacter) {
                    promptManager.appendPrompt(addedPrompt, promptManager.activeCharacter);
                    promptManager.saveServiceSettings();
                    promptManager.render();
                }
            }
            applyQuickToggleDataToPrompt(promptId, quickData);
            if (selectedPosition) {
                movePromptToPosition(promptId, selectedPosition);
            }
            if (getFeatureSettings().autoSavePreset) {
                document.getElementById('update_oai_preset')?.click();
            }
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

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            toastr.success(L.copiedToClipboard);
            return;
        }
    } catch (err) {
        console.warn('Clipboard API failed, falling back:', err);
    }

    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textArea);

        if (success) {
            toastr.success(L.copiedToClipboard);
        } else {
            toastr.error(L.copyFailed);
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        toastr.error(L.copyFailed);
    }
}

/**
 * Add prompt to current prompt manager
 * @param {object} prompt - Prompt object to add
 */
function addPromptToManager(prompt) {
    if (!promptManager) {
        toastr.error(L.promptManagerNotInit);
        return;
    }

    if (isPromptPositionFeatureEnabled()) {
        showPositionSelectModal(prompt);
    } else {
        addPromptToManagerAtEnd(prompt);
    }
}

function addPromptToManagerAtEnd(prompt) {
    const newIdentifier = uuidv4();
    const newPrompt = {
        ...prompt,
        identifier: newIdentifier,
        system_prompt: false,
    };

    promptManager.addPrompt(newPrompt, newIdentifier);

    const addedPrompt = promptManager.getPromptById(newIdentifier);
    if (addedPrompt && promptManager.activeCharacter) {
        promptManager.appendPrompt(addedPrompt, promptManager.activeCharacter);
    }

    promptManager.saveServiceSettings();
    promptManager.render();

    toastr.success(L.promptAdded(prompt.name));
}

function addPromptToManagerAtPosition(prompt, afterIdentifier) {
    const newIdentifier = uuidv4();
    const newPrompt = {
        ...prompt,
        identifier: newIdentifier,
        system_prompt: false,
    };

    promptManager.addPrompt(newPrompt, newIdentifier);

    const preset = getActivePromptManagerPreset();
    const promptOrderEntry = preset?.prompt_order?.find(entry => entry.character_id === GLOBAL_PROMPT_CHARACTER_ID);

    if (promptOrderEntry?.order && afterIdentifier) {
        const afterIndex = promptOrderEntry.order.findIndex(item => item.identifier === afterIdentifier);
        if (afterIndex !== -1) {
            promptOrderEntry.order.splice(afterIndex + 1, 0, { identifier: newIdentifier, enabled: true });
        } else {
            promptOrderEntry.order.push({ identifier: newIdentifier, enabled: true });
        }
    } else {
        const addedPrompt = promptManager.getPromptById(newIdentifier);
        if (addedPrompt && promptManager.activeCharacter) {
            promptManager.appendPrompt(addedPrompt, promptManager.activeCharacter);
        }
    }

    promptManager.saveServiceSettings();
    promptManager.render();

    toastr.success(L.promptAdded(prompt.name));
}

function showPositionSelectModal(prompt) {
    const preset = getActivePromptManagerPreset();
    const linkedPrompts = getOrderedPrompts(preset).filter(({ isLinked }) => isLinked);

    if (linkedPrompts.length === 0) {
        addPromptToManagerAtEnd(prompt);
        return;
    }

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal';

    const title = document.createElement('h3');
    title.textContent = L.selectInsertPosition;
    title.style.marginBottom = '10px';

    const desc = document.createElement('p');
    desc.textContent = L.insertBelowSelected;
    desc.style.marginBottom = '10px';
    desc.style.opacity = '0.7';
    desc.style.fontSize = '0.9em';

    const select = document.createElement('select');
    select.className = 'text_pole';
    select.style.width = '100%';
    select.style.marginBottom = '10px';

    linkedPrompts.forEach(({ prompt: p }) => {
        const option = document.createElement('option');
        option.value = p.identifier;
        option.textContent = p.name;
        select.appendChild(option);
    });

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'menu_button';
    cancelBtn.textContent = L.cancel;
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'menu_button';
    confirmBtn.textContent = L.confirm;
    confirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (select.value) {
            addPromptToManagerAtPosition(prompt, select.value);
        } else {
            addPromptToManagerAtEnd(prompt);
        }
        removeModal();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(select);
    modal.appendChild(btnRow);

    // Prevent events from bubbling up to ST's outside-click handlers
    // Modal uses bubbling phase so child buttons still receive events
    const stopAll = (e) => e.stopPropagation();
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
        modal.addEventListener(evt, stopAll);
        overlay.addEventListener(evt, stopAll);
    }
    overlay.addEventListener('click', () => removeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // Position with JS to avoid CSS containment issues from ancestor transforms
    requestAnimationFrame(() => {
        const modalHeight = modal.offsetHeight;
        const modalWidth = modal.offsetWidth;
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;
        modal.style.top = Math.max(10, (viewH - modalHeight) / 2) + 'px';
        modal.style.left = Math.max(10, (viewW - modalWidth) / 2) + 'px';
    });
}

/**
 * Get prompt by identifier from prompts array
 * @param {object[]} prompts - Array of prompts
 * @param {string} identifier - Prompt identifier
 * @returns {object|null} Prompt object or null
 */
function getPromptByIdentifier(prompts, identifier) {
    return prompts.find(p => p && p.identifier === identifier) || null;
}

/**
 * Get prompts with linkage status based on prompt_order
 * @param {object} preset - Preset object
 * @returns {{prompt: object, isLinked: boolean, isEnabled: boolean}[]} Prompt list with linkage status
 */
function getOrderedPrompts(preset) {
    if (!preset || !preset.prompts) return [];

    // Find prompt_order for the global/dummy character (100001)
    const promptOrderEntry = preset.prompt_order?.find(entry => entry.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    const validPrompts = preset.prompts.filter(p => p && p.name);
    const promptMap = new Map(validPrompts.map(prompt => [prompt.identifier, prompt]));
    const linkedIdentifiers = new Set();

    if (promptOrderEntry && promptOrderEntry.order && promptOrderEntry.order.length > 0) {
        // Return linked prompts in the order specified by prompt_order
        const orderedPrompts = [];
        for (const orderItem of promptOrderEntry.order) {
            const prompt = promptMap.get(orderItem.identifier);
            if (prompt) {
                orderedPrompts.push({ prompt, isLinked: true, isEnabled: !!orderItem.enabled });
                linkedIdentifiers.add(prompt.identifier);
            }
        }

        // Append prompts that exist in presets but are not connected to prompt_order
        for (const prompt of validPrompts) {
            if (!linkedIdentifiers.has(prompt.identifier)) {
                orderedPrompts.push({ prompt, isLinked: false, isEnabled: false });
            }
        }

        return orderedPrompts;
    }

    // Fallback: no prompt_order means every prompt is effectively unlinked
    return validPrompts.map(prompt => ({ prompt, isLinked: false, isEnabled: false }));
}

// ========== Quick Toggle Group ==========

/**
 * 토글 이름 필드를 그룹 이름 목록으로 파싱한다.
 * "약, 중, 강" → ['약', '중', '강'] (공백 정리 + 중복 제거, 입력 순서 유지)
 * 값이 하나뿐이면 예전과 똑같이 동작하므로 기존 데이터와 그대로 호환된다.
 * @param {string} rawValue
 * @returns {string[]}
 */
function parseQuickToggleNames(rawValue) {
    if (!rawValue) return [];
    const seen = new Set();
    const names = [];
    for (const part of String(rawValue).split(QUICK_TOGGLE_GROUP_SEPARATOR)) {
        const name = part.trim();
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
    }
    return names;
}

/**
 * 그룹 이름 목록을 프롬프트에 저장할 문자열로 되돌린다.
 * @param {string[]} names
 * @returns {string}
 */
function formatQuickToggleNames(names) {
    return names.join(`${QUICK_TOGGLE_GROUP_SEPARATOR} `);
}

/**
 * 프롬프트가 속한 그룹 이름 목록 (토글 사용 체크가 꺼져 있으면 빈 배열)
 * @param {object} prompt
 * @returns {string[]}
 */
function getPromptQuickToggleNames(prompt) {
    if (!prompt || !prompt[QUICK_TOGGLE_ENABLED_KEY]) return [];
    return parseQuickToggleNames(prompt[QUICK_TOGGLE_NAME_KEY]);
}

/**
 * 그룹 이름을 배타 세트와 표시용 이름으로 나눈다.
 * "강도::약" → { setName: '강도', label: '약' }
 * "약"          → { setName: '', label: '약' }
 * @param {string} fullName
 * @returns {{setName: string, label: string}}
 */
function parseGroupKey(fullName) {
    const raw = String(fullName || '');
    const index = raw.indexOf(QUICK_TOGGLE_SET_SEPARATOR);
    if (index <= 0) return { setName: '', label: raw.trim() };

    const setName = raw.slice(0, index).trim();
    const label = raw.slice(index + QUICK_TOGGLE_SET_SEPARATOR.length).trim();
    // 어느 한쪽이 비면 세트로 보지 않고 이름 그대로 쓴다.
    if (!setName || !label) return { setName: '', label: raw.trim() };
    return { setName, label };
}

/**
 * 세트와 이름을 그룹 이름 하나로 합친다.
 * @param {string} setName
 * @param {string} label
 * @returns {string}
 */
function buildGroupKey(setName, label) {
    return setName ? `${setName}${QUICK_TOGGLE_SET_SEPARATOR}${label}` : label;
}

function getLinkedQuickToggleGroups(preset) {
    if (!preset) return [];

    // 한 프롬프트가 여러 그룹에 동시에 속할 수 있다.
    // (예: 공용 프롬프트 1·2번을 약/중/강 세 그룹에 모두 넣는 구성)
    // 버튼 순서는 그룹의 첫 멤버가 prompt_order에 등장하는 순서를 따른다.
    const groups = new Map();
    for (const { prompt, isLinked, isEnabled } of getOrderedPrompts(preset)) {
        if (!isLinked) continue;
        for (const name of getPromptQuickToggleNames(prompt)) {
            if (!groups.has(name)) {
                groups.set(name, { name, prompts: [], identifiers: [], enabledCount: 0 });
            }
            const group = groups.get(name);
            group.prompts.push(prompt);
            group.identifiers.push(prompt.identifier);
            if (isEnabled) group.enabledCount += 1;
        }
    }

    // 멤버가 그룹 간에 겹치므로 "하나라도 켜짐"으로는 상태를 판단할 수 없다.
    // 공용 프롬프트만 켜져 있는 경우를 'partial'로 따로 구분한다.
    return Array.from(groups.values()).map(group => ({
        ...group,
        ...parseGroupKey(group.name),
        state: group.enabledCount === 0
            ? 'off'
            : group.enabledCount === group.identifiers.length ? 'on' : 'partial',
    }));
}

/**
 * 지금 완전히 켜져 있는 다른 그룹이 계속 쓰고 있어서 꺼서는 안 되는 프롬프트를 모은다.
 * 그룹끼리 프롬프트를 공유할 때, 한 그룹을 껐다고 다른 켜진 그룹까지 무너지는 것을 막는다.
 * @param {object} group - 지금 조작 중인 그룹
 * @param {object[]} allGroups
 * @param {boolean} ignoreSameSet - 배타 세트 전환 중이면 같은 세트는 보호하지 않는다 (끄는 게 목적이므로)
 * @returns {{held: Set<string>, holders: string[]}} 보호할 identifier와 그 이유가 된 그룹 이름
 */
function getHeldIdentifiers(group, allGroups, ignoreSameSet = false) {
    const held = new Set();
    const holders = [];
    const own = new Set(group.identifiers);

    for (const other of allGroups) {
        if (other.name === group.name || other.state !== 'on') continue;
        if (ignoreSameSet && other.setName && other.setName === group.setName) continue;

        let overlaps = false;
        for (const identifier of other.identifiers) {
            held.add(identifier);
            if (own.has(identifier)) overlaps = true;
        }
        if (overlaps) holders.push(other.label);
    }

    return { held, holders };
}

/**
 * 그룹 버튼을 눌렀을 때의 on/off 처리
 * @param {object} preset
 * @param {object} group - getLinkedQuickToggleGroups()가 만든 그룹
 * @param {object[]} allGroups - 공유 프롬프트/배타 세트 처리를 위한 전체 그룹 목록
 */
function toggleQuickToggleGroup(preset, group, allGroups = []) {
    const promptOrderEntry = preset?.prompt_order?.find(entry => entry.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    if (!promptOrderEntry?.order) return;

    const own = new Set(group.identifiers);
    const targets = promptOrderEntry.order.filter(item => own.has(item.identifier));
    if (targets.length === 0) return;

    // 전부 켜져 있을 때만 끄고, 일부만 켜졌거나 전부 꺼져 있으면 켠다.
    const allEnabled = targets.every(item => !!item.enabled);

    if (allEnabled) {
        // 끄기: 아직 켜져 있는 다른 그룹이 쓰는 프롬프트는 남긴다.
        // (test1={a,b,c}와 test2={a,b,d}가 둘 다 켜진 상태에서 test1만 끄면 c만 꺼지고 test2는 유지)
        const { held, holders } = getHeldIdentifiers(group, allGroups);
        const turnOff = targets.filter(item => !held.has(item.identifier));

        if (turnOff.length === 0) {
            // 이 그룹의 프롬프트를 전부 다른 켜진 그룹이 쓰고 있어서 끌 것이 없다.
            toastr.info(L.toggleGroupHeldByOthers(holders.join(', ')));
            return;
        }
        turnOff.forEach(item => { item.enabled = false; });
    } else {
        if (group.setName) {
            // 배타 세트: 같은 세트의 다른 그룹은 끈다.
            // 단, 이 그룹과 공유하는 프롬프트와, 세트 밖에서 켜져 있는 그룹이 쓰는 프롬프트는 남긴다.
            const { held } = getHeldIdentifiers(group, allGroups, true);
            const turnOff = new Set();
            for (const other of allGroups) {
                if (other.setName !== group.setName || other.name === group.name) continue;
                for (const identifier of other.identifiers) {
                    if (!own.has(identifier) && !held.has(identifier)) turnOff.add(identifier);
                }
            }
            promptOrderEntry.order.forEach(item => {
                if (turnOff.has(item.identifier)) item.enabled = false;
            });
        }
        targets.forEach(item => { item.enabled = true; });
    }

    promptManager?.saveServiceSettings?.();
    promptManager?.render?.();
}

// ========== Quick Toggle Group Manager ==========

/**
 * 현재 프리셋의 그룹 구성을 읽어온다.
 * @param {object} preset
 * @returns {Map<string, Set<string>>} 그룹 이름 → 멤버 identifier 집합
 */
function buildQuickToggleGroupModel(preset) {
    const model = new Map();
    for (const { prompt } of getOrderedPrompts(preset)) {
        for (const name of getPromptQuickToggleNames(prompt)) {
            if (!model.has(name)) model.set(name, new Set());
            model.get(name).add(prompt.identifier);
        }
    }
    return model;
}

/**
 * 모델에서 특정 프롬프트가 속한 그룹 이름 목록 (모델의 그룹 순서 유지)
 * @param {Map<string, Set<string>>} model
 * @param {string} identifier
 * @returns {string[]}
 */
function getMembershipFromModel(model, identifier) {
    const names = [];
    for (const [name, members] of model) {
        if (members.has(identifier)) names.push(name);
    }
    return names;
}

/**
 * 편집한 그룹 구성을 프롬프트에 다시 써넣는다.
 * 소속이 실제로 바뀐 프롬프트만 건드린다. 관리창에서 손대지 않았고
 * "이름은 있지만 사용 안 함" 상태인 프롬프트의 이름이 지워지는 것을 막기 위함.
 * @returns {number} 변경된 프롬프트 수
 */
function applyQuickToggleGroupModel(preset, initialModel, nextModel) {
    let changed = 0;
    for (const { prompt } of getOrderedPrompts(preset)) {
        const before = getMembershipFromModel(initialModel, prompt.identifier);
        const after = getMembershipFromModel(nextModel, prompt.identifier);
        if (before.join(',') === after.join(',')) continue;

        prompt[QUICK_TOGGLE_NAME_KEY] = formatQuickToggleNames(after);
        prompt[QUICK_TOGGLE_ENABLED_KEY] = after.length > 0;
        changed += 1;
    }
    if (changed === 0) return 0;

    promptManager?.saveServiceSettings?.();
    promptManager?.render?.();
    renderQuickToggleButtons();
    return changed;
}

/**
 * 그룹 구성은 프롬프트에 실려 프리셋 파일에 저장되므로, 프리셋을 저장해야 남는다.
 */
function saveActivePreset() {
    document.getElementById('update_oai_preset')?.click();
}

/**
 * 그룹 이름/세트 이름에 쓸 수 없는 문자 검사.
 * 쉼표는 그룹 구분자, "::"는 세트 구분자라 이름 안에 들어갈 수 없다.
 * @returns {boolean} 사용 가능하면 true
 */
function isValidGroupNamePart(name) {
    if (name.includes(QUICK_TOGGLE_GROUP_SEPARATOR)) {
        toastr.warning(L.toggleGroupNameComma);
        return false;
    }
    if (name.includes(QUICK_TOGGLE_SET_SEPARATOR)) {
        toastr.warning(L.toggleGroupNameSeparator);
        return false;
    }
    return true;
}

/**
 * 새 그룹 키를 만들고 중복을 검사한다.
 * @returns {string} 그룹 키 (실패 시 빈 문자열)
 */
function makeGroupKey(rawLabel, setName, model, previousKey = '') {
    const label = String(rawLabel || '').trim();
    if (!label || !isValidGroupNamePart(label)) return '';

    const key = buildGroupKey(setName, label);
    if (key !== previousKey && model.has(key)) {
        toastr.warning(L.toggleGroupNameExists);
        return '';
    }
    return key;
}

/**
 * Map의 키 하나를 순서 그대로 유지하며 바꾼다. (버튼 순서 보존)
 * @param {Map<string, Set<string>>} model
 */
function renameGroupKeyInPlace(model, oldKey, newKey) {
    const renamed = new Map();
    for (const [key, members] of model) {
        renamed.set(key === oldKey ? newKey : key, members);
    }
    model.clear();
    for (const [key, members] of renamed) model.set(key, members);
}

function showQuickToggleGroupModal() {
    const preset = getActivePromptManagerPreset();
    const allPrompts = getOrderedPrompts(preset);

    if (allPrompts.length === 0) {
        toastr.warning(L.noPromptsInPreset);
        return;
    }

    const initialModel = buildQuickToggleGroupModel(preset);
    // 편집용 사본 (취소 시 그대로 버린다)
    const model = new Map(Array.from(initialModel, ([name, members]) => [name, new Set(members)]));
    let selectedGroup = model.keys().next().value || '';
    let memberKeyword = '';

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal custom_preset_group_modal';

    const title = document.createElement('h3');
    title.textContent = L.toggleGroupTitle;
    title.style.marginBottom = '10px';

    const desc = document.createElement('p');
    desc.textContent = L.toggleGroupDesc;
    desc.style.marginBottom = '10px';
    desc.style.opacity = '0.7';
    desc.style.fontSize = '0.9em';

    // ----- 좌: 그룹 목록 / 우: 멤버 선택 -----
    const body = document.createElement('div');
    body.className = 'custom_preset_group_body';

    const groupPane = document.createElement('div');
    groupPane.className = 'custom_preset_group_pane';

    const groupPaneLabel = document.createElement('label');
    groupPaneLabel.textContent = L.toggleGroupListLabel;
    groupPaneLabel.className = 'custom_preset_group_pane_label';

    const groupList = document.createElement('div');
    groupList.className = 'custom_preset_group_list';

    const groupActions = document.createElement('div');
    groupActions.className = 'custom_preset_group_actions';

    const memberPane = document.createElement('div');
    memberPane.className = 'custom_preset_group_pane';

    const memberPaneLabel = document.createElement('label');
    memberPaneLabel.className = 'custom_preset_group_pane_label';

    const memberSearch = document.createElement('input');
    memberSearch.className = 'text_pole';
    memberSearch.type = 'text';
    memberSearch.placeholder = L.toggleGroupSearchPlaceholder;
    memberSearch.addEventListener('input', () => {
        memberKeyword = memberSearch.value.trim().toLowerCase();
        renderMembers();
    });

    const memberList = document.createElement('div');
    memberList.className = 'custom_preset_group_member_list';

    function renderGroups() {
        groupList.innerHTML = '';

        if (model.size === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom_preset_empty_message';
            empty.textContent = L.toggleGroupEmpty;
            groupList.appendChild(empty);
            return;
        }

        for (const [name, members] of model) {
            const { setName, label } = parseGroupKey(name);
            const row = document.createElement('div');
            row.className = 'custom_preset_group_row';
            if (name === selectedGroup) row.classList.add('selected');

            const nameSpan = document.createElement('span');
            nameSpan.className = 'custom_preset_group_row_name';
            nameSpan.textContent = label;
            nameSpan.title = name;

            const countSpan = document.createElement('span');
            countSpan.className = 'custom_preset_group_row_count';
            countSpan.textContent = L.toggleGroupMemberCount(members.size);

            row.appendChild(nameSpan);

            if (setName) {
                const setBadge = document.createElement('span');
                setBadge.className = 'custom_preset_group_row_set';
                setBadge.textContent = setName;
                setBadge.title = L.toggleGroupInSet(setName);
                row.appendChild(setBadge);
            }

            row.appendChild(countSpan);
            row.addEventListener('click', () => {
                selectedGroup = name;
                renderGroups();
                renderMembers();
            });
            groupList.appendChild(row);
        }
    }

    function renderMembers() {
        memberList.innerHTML = '';
        memberPaneLabel.textContent = selectedGroup
            ? L.toggleGroupMembersOf(parseGroupKey(selectedGroup).label)
            : L.toggleGroupMembersLabel;

        if (!selectedGroup) {
            const empty = document.createElement('div');
            empty.className = 'custom_preset_empty_message';
            empty.textContent = L.toggleGroupSelectFirst;
            memberList.appendChild(empty);
            return;
        }

        const members = model.get(selectedGroup);
        const visible = allPrompts.filter(({ prompt }) => matchesSearch(prompt, memberKeyword));

        if (visible.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'custom_preset_empty_message';
            empty.textContent = L.noSearchResults;
            memberList.appendChild(empty);
            return;
        }

        for (const { prompt, isLinked } of visible) {
            const label = document.createElement('label');
            label.className = 'checkbox_label custom_preset_group_member';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = members.has(prompt.identifier);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    members.add(prompt.identifier);
                } else {
                    members.delete(prompt.identifier);
                }
                renderGroups();
                updateMemberBadges(label, prompt);
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'custom_preset_group_member_name';
            nameSpan.textContent = prompt.name;
            nameSpan.title = prompt.name;

            label.appendChild(checkbox);
            label.appendChild(nameSpan);

            if (!isLinked) {
                const badge = document.createElement('span');
                badge.className = 'custom_preset_prompt_status';
                badge.textContent = L.unlinked;
                badge.title = L.unlinkedTitle;
                label.appendChild(badge);
            }

            updateMemberBadges(label, prompt);
            memberList.appendChild(label);
        }
    }

    /** 이 프롬프트가 지금 선택한 그룹 말고 어디에 더 속해 있는지 표시 */
    function updateMemberBadges(label, prompt) {
        label.querySelector('.custom_preset_group_member_others')?.remove();
        const others = getMembershipFromModel(model, prompt.identifier)
            .filter(n => n !== selectedGroup)
            .map(n => parseGroupKey(n).label);
        if (others.length === 0) return;

        const badge = document.createElement('span');
        badge.className = 'custom_preset_group_member_others';
        badge.textContent = others.join(', ');
        badge.title = L.toggleGroupAlsoIn(others.join(', '));
        label.appendChild(badge);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'menu_button';
    addBtn.innerHTML = `<i class="fa-solid fa-plus"></i> ${L.toggleGroupAdd}`;
    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = makeGroupKey(prompt(L.toggleGroupNewPrompt), '', model);
        if (!key) return;
        model.set(key, new Set());
        selectedGroup = key;
        renderGroups();
        renderMembers();
    });

    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'menu_button';
    renameBtn.innerHTML = '<i class="fa-solid fa-pencil"></i>';
    renameBtn.title = L.toggleGroupRenameTitle;
    renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedGroup) return;
        const { setName, label } = parseGroupKey(selectedGroup);
        const key = makeGroupKey(prompt(L.toggleGroupRenamePrompt, label), setName, model, selectedGroup);
        if (!key || key === selectedGroup) return;

        renameGroupKeyInPlace(model, selectedGroup, key);
        selectedGroup = key;
        renderGroups();
        renderMembers();
    });

    const setBtn = document.createElement('button');
    setBtn.type = 'button';
    setBtn.className = 'menu_button';
    setBtn.innerHTML = '<i class="fa-solid fa-object-group"></i>';
    setBtn.title = L.toggleGroupSetTitle;
    setBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedGroup) return;
        const { setName, label } = parseGroupKey(selectedGroup);

        const answer = prompt(L.toggleGroupSetPrompt, setName);
        if (answer === null) return;

        // 빈 값으로 두면 배타 세트에서 빼낸다.
        const nextSet = answer.trim();
        if (nextSet && !isValidGroupNamePart(nextSet)) return;

        const key = makeGroupKey(label, nextSet, model, selectedGroup);
        if (!key || key === selectedGroup) return;

        renameGroupKeyInPlace(model, selectedGroup, key);
        selectedGroup = key;
        renderGroups();
        renderMembers();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'menu_button';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.title = L.toggleGroupDeleteTitle;
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedGroup) return;
        if (!confirm(L.toggleGroupDeleteConfirm(parseGroupKey(selectedGroup).label))) return;
        model.delete(selectedGroup);
        selectedGroup = model.keys().next().value || '';
        renderGroups();
        renderMembers();
    });

    groupActions.appendChild(addBtn);
    groupActions.appendChild(renameBtn);
    groupActions.appendChild(setBtn);
    groupActions.appendChild(deleteBtn);

    groupPane.appendChild(groupPaneLabel);
    groupPane.appendChild(groupList);
    groupPane.appendChild(groupActions);

    memberPane.appendChild(memberPaneLabel);
    memberPane.appendChild(memberSearch);
    memberPane.appendChild(memberList);

    body.appendChild(groupPane);
    body.appendChild(memberPane);

    // ----- 하단 버튼 -----
    const btnRow = document.createElement('div');
    btnRow.className = 'custom_preset_group_footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'menu_button';
    cancelBtn.textContent = L.cancel;
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'menu_button';
    saveBtn.textContent = L.toggleGroupSave;
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();

        // 멤버가 없는 그룹은 저장할 곳이 없다 (그룹 정보는 멤버 프롬프트에 실려 저장되므로).
        const emptyGroups = Array.from(model).filter(([, members]) => members.size === 0).map(([name]) => name);
        for (const name of emptyGroups) model.delete(name);

        const changed = applyQuickToggleGroupModel(preset, initialModel, model);
        removeModal();

        if (emptyGroups.length > 0) {
            toastr.warning(L.toggleGroupEmptyDropped(emptyGroups.join(', ')));
        }
        if (changed === 0) {
            toastr.info(L.toggleGroupNoChange);
            return;
        }
        saveActivePreset();
        toastr.success(L.toggleGroupSaved(changed));
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(body);
    modal.appendChild(btnRow);

    renderGroups();
    renderMembers();

    // Prevent events from bubbling up to ST's outside-click handlers
    const stopAll = (e) => e.stopPropagation();
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
        modal.addEventListener(evt, stopAll);
        overlay.addEventListener(evt, stopAll);
    }
    overlay.addEventListener('click', () => removeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        const modalHeight = modal.offsetHeight;
        const modalWidth = modal.offsetWidth;
        modal.style.top = Math.max(10, (window.innerHeight - modalHeight) / 2) + 'px';
        modal.style.left = Math.max(10, (window.innerWidth - modalWidth) / 2) + 'px';
    });
}

function createQuickToggleGroupUI() {
    // 라벨과 버튼을 한 줄에 둔다. (항목이 둘뿐이라 줄을 나누면 공간만 낭비됨)
    const section = document.createElement('div');
    section.id = 'custom_preset_toggle_group_section';

    const label = document.createElement('label');
    label.textContent = L.toggleGroupLabel;
    label.className = 'custom_preset_toggle_group_label';

    const manageBtn = document.createElement('button');
    manageBtn.type = 'button';
    manageBtn.id = 'custom_preset_toggle_group_manage_btn';
    manageBtn.className = 'menu_button';
    manageBtn.innerHTML = `<i class="fa-solid fa-layer-group"></i> ${L.toggleGroupManage}`;
    manageBtn.title = L.toggleGroupManageTitle;
    manageBtn.addEventListener('click', showQuickToggleGroupModal);

    section.appendChild(label);
    section.appendChild(manageBtn);
    return section;
}

function movePromptToPosition(promptId, afterIdentifier) {
    const preset = getActivePromptManagerPreset();
    if (!preset) return;

    const promptOrderEntry = preset.prompt_order?.find(entry => entry.character_id === GLOBAL_PROMPT_CHARACTER_ID);
    if (!promptOrderEntry?.order) return;

    const currentIndex = promptOrderEntry.order.findIndex(item => item.identifier === promptId);
    if (currentIndex === -1) return;

    const [removed] = promptOrderEntry.order.splice(currentIndex, 1);

    const afterIndex = promptOrderEntry.order.findIndex(item => item.identifier === afterIdentifier);
    if (afterIndex !== -1) {
        promptOrderEntry.order.splice(afterIndex + 1, 0, removed);
    } else {
        promptOrderEntry.order.push(removed);
    }

    promptManager?.saveServiceSettings?.();
    promptManager?.render?.();
}

function createQuickToggleCollapseButtonElement() {
    const button = document.createElement('div');
    button.id = 'custom_preset_quick_toggle_button';
    button.className = 'far fa-caret-square-up interactable';
    button.tabIndex = 0;
    button.style.display = 'none';
    button.title = L.expandToggle;
    return button;
}

function attachQuickToggleCollapseButtonListener(buttonElement) {
    if (quickToggleButtonListenerAttached) return;
    buttonElement.addEventListener('click', () => {
        setQuickToggleBarCollapsed(!isQuickToggleBarCollapsed());
        renderQuickToggleButtons();
    });
    quickToggleButtonListenerAttached = true;
}

function ensureQuickToggleCollapseButton() {
    let toggleButton = document.getElementById('custom_preset_quick_toggle_button');
    const extensionsMenuButton = document.getElementById('extensionsMenuButton');

    if (!toggleButton && extensionsMenuButton) {
        toggleButton = createQuickToggleCollapseButtonElement();
        extensionsMenuButton.insertAdjacentElement('afterend', toggleButton);
        attachQuickToggleCollapseButtonListener(toggleButton);
    } else if (toggleButton && !quickToggleButtonListenerAttached) {
        attachQuickToggleCollapseButtonListener(toggleButton);
    }

    return toggleButton;
}

function updateQuickToggleCollapseButtonState(hasQuickPrompts) {
    const toggleButton = ensureQuickToggleCollapseButton();
    if (!toggleButton) return;

    const visible = isQuickToggleFeatureEnabled() && isQuickToggleCollapseFeatureEnabled() && hasQuickPrompts;
    toggleButton.style.display = visible ? 'flex' : 'none';

    if (!visible) return;

    if (isQuickToggleBarCollapsed()) {
        toggleButton.className = 'far fa-caret-square-up interactable';
        toggleButton.title = L.expandToggle;
    } else {
        toggleButton.className = 'fas fa-caret-square-down interactable';
        toggleButton.title = L.collapseToggle;
    }
}

function renderQuickToggleButtons() {
    const existingBar = document.getElementById('custom_preset_quick_toggle_bar');
    if (existingBar) existingBar.remove();

    if (!isQuickToggleFeatureEnabled()) {
        updateQuickToggleCollapseButtonState(false);
        return;
    }

    const sendForm = document.getElementById('send_form');
    if (!sendForm) {
        updateQuickToggleCollapseButtonState(false);
        return;
    }

    const preset = getActivePromptManagerPreset();
    const quickToggleGroups = getLinkedQuickToggleGroups(preset);
    if (quickToggleGroups.length === 0) {
        updateQuickToggleCollapseButtonState(false);
        return;
    }

    const collapsed = isQuickToggleCollapseFeatureEnabled() ? isQuickToggleBarCollapsed() : false;

    const bar = document.createElement('div');
    bar.id = 'custom_preset_quick_toggle_bar';
    bar.className = `custom_preset_quick_toggle_bar ${collapsed
        ? 'custom_preset_quick_toggle_bar-collapsed'
        : 'custom_preset_quick_toggle_bar-expanded'}`;

    quickToggleGroups.forEach((group) => {
        const { prompts, identifiers, state, enabledCount, label, setName } = group;
        const button = document.createElement('button');
        button.className = 'menu_button custom_preset_quick_toggle_button';
        if (state === 'off') button.classList.add('is_disabled');
        if (state === 'partial') button.classList.add('is_partial');
        // 배타 세트에 속하면 세트 이름은 빼고 표시한다. ("강도::약" → "약")
        button.textContent = label;

        const memberNames = prompts.map(p => p.name).join(', ');
        const lines = [state === 'partial'
            ? L.toggleGroupPartial(memberNames, enabledCount, identifiers.length)
            : L.togglePrompt(memberNames)];
        if (setName) lines.push(L.toggleGroupInSet(setName));
        button.title = lines.join('\n');

        button.addEventListener('click', () => {
            const activePreset = getActivePromptManagerPreset();
            const groups = getLinkedQuickToggleGroups(activePreset);
            const target = groups.find(g => g.name === group.name) || group;
            toggleQuickToggleGroup(activePreset, target, groups);
            renderQuickToggleButtons();
        });
        bar.appendChild(button);
    });
    updateQuickToggleCollapseButtonState(true);

    const qrBar = document.getElementById('qr--bar');
    const ggQrContainer = document.getElementById('gg-qr-container');
    const ggActionContainer = document.getElementById('gg-action-button-container');

    if (ggActionContainer?.parentElement) {
        ggActionContainer.parentElement.insertBefore(bar, ggActionContainer);
        return;
    }

    if (ggQrContainer?.parentElement) {
        ggQrContainer.parentElement.insertBefore(bar, ggQrContainer);
        return;
    }

    if (qrBar?.parentElement) {
        qrBar.parentElement.insertBefore(bar, qrBar);
        return;
    }

    const anchor = document.getElementById('nonQRFormItems') || sendForm.firstElementChild;
    if (anchor?.parentElement === sendForm) {
        sendForm.insertBefore(bar, anchor);
    } else {
        sendForm.prepend(bar);
    }
}

/**
 * Show compare modal for comparing two prompts
 * @param {object} sourcePrompt - The prompt clicked in the customizer (read-only, shown on top)
 */
function showCompareModal(sourcePrompt) {
    const preset = getActivePromptManagerPreset();
    const orderedPrompts = getOrderedPrompts(preset).filter(({ prompt }) => prompt && prompt.name && !prompt.marker);

    if (orderedPrompts.length === 0) return;

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal custom_preset_compare_modal';

    // Title
    const title = document.createElement('h3');
    title.textContent = L.compareTitle;
    title.style.marginBottom = '10px';

    // Description
    const desc = document.createElement('p');
    desc.textContent = L.compareDesc;
    desc.style.marginBottom = '14px';
    desc.style.opacity = '0.7';
    desc.style.fontSize = '0.9em';

    // === Top section: source prompt (read-only) ===
    const topLabel = document.createElement('label');
    topLabel.textContent = sourcePrompt.name;
    topLabel.style.fontWeight = '600';
    topLabel.style.marginBottom = '4px';
    topLabel.style.display = 'block';

    const topTextarea = document.createElement('textarea');
    topTextarea.className = 'text_pole custom_preset_compare_textarea';
    topTextarea.value = sourcePrompt.content || '';
    topTextarea.readOnly = true;
    topTextarea.style.opacity = '0.8';

    // === Bottom section: comparison prompt (editable) ===
    const bottomLabel = document.createElement('label');
    bottomLabel.textContent = L.compareSelectPrompt;
    bottomLabel.style.fontWeight = '600';
    bottomLabel.style.marginTop = '14px';
    bottomLabel.style.marginBottom = '4px';
    bottomLabel.style.display = 'block';

    const select = document.createElement('select');
    select.className = 'text_pole';
    select.style.width = '100%';
    select.style.marginBottom = '8px';

    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = L.compareSelectPlaceholder;
    placeholderOpt.disabled = true;
    placeholderOpt.selected = true;
    select.appendChild(placeholderOpt);

    orderedPrompts.forEach(({ prompt }) => {
        const option = document.createElement('option');
        option.value = prompt.identifier;
        option.textContent = prompt.name;
        select.appendChild(option);
    });

    const bottomTextarea = document.createElement('textarea');
    bottomTextarea.className = 'text_pole custom_preset_compare_textarea';
    bottomTextarea.value = '';
    bottomTextarea.placeholder = L.compareSelectPlaceholder;

    // Track currently selected prompt for saving
    let selectedPromptRef = null;

    select.addEventListener('change', () => {
        const found = orderedPrompts.find(({ prompt }) => prompt.identifier === select.value);
        if (found) {
            selectedPromptRef = found.prompt;
            bottomTextarea.value = found.prompt.content || '';
        }
    });

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.marginTop = '10px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'menu_button';
    cancelBtn.textContent = L.cancel;
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'menu_button';
    saveBtn.textContent = L.compareSave;
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedPromptRef) return;
        selectedPromptRef.content = bottomTextarea.value;
        saveSettingsDebounced();
        if (getFeatureSettings().autoSavePreset) {
            document.getElementById('update_oai_preset')?.click();
        }
        toastr.success(L.compareSaved(selectedPromptRef.name));
        removeModal();
        // Re-render the prompt list to reflect changes
        const presetSelect = document.getElementById('custom_preset_select');
        if (presetSelect) {
            const currentPreset = getPresetByName(presetSelect.value);
            renderPromptList(currentPreset);
        }
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);

    // Assemble modal
    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(topLabel);
    modal.appendChild(topTextarea);
    modal.appendChild(bottomLabel);
    modal.appendChild(select);
    modal.appendChild(bottomTextarea);
    modal.appendChild(btnRow);

    // Prevent events from bubbling
    const stopAll = (e) => e.stopPropagation();
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
        modal.addEventListener(evt, stopAll);
        overlay.addEventListener(evt, stopAll);
    }
    overlay.addEventListener('click', () => removeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // Center modal
    requestAnimationFrame(() => {
        const modalHeight = modal.offsetHeight;
        const modalWidth = modal.offsetWidth;
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;
        modal.style.top = Math.max(10, (viewH - modalHeight) / 2) + 'px';
        modal.style.left = Math.max(10, (viewW - modalWidth) / 2) + 'px';
    });
}

// === Translation feature ===

function getStoredTranslation(promptId) {
    const settings = getFeatureSettings();
    if (!settings.translations || typeof settings.translations !== 'object') return null;
    const entry = settings.translations[promptId];
    if (!entry || !entry.translated) return null;
    return entry;
}

function setStoredTranslation(promptId, original, translated) {
    const settings = getFeatureSettings();
    if (!settings.translations || typeof settings.translations !== 'object') {
        settings.translations = {};
    }
    settings.translations[promptId] = {
        original,
        translated,
        translatedAt: Date.now(),
    };
    saveFeatureSettings();
}

function deleteStoredTranslation(promptId) {
    const settings = getFeatureSettings();
    if (!settings.translations || typeof settings.translations !== 'object') return;
    delete settings.translations[promptId];
    saveFeatureSettings();
}

function buildTranslationPrompt(content) {
    const settings = getFeatureSettings();
    const template = (settings.translationPromptTemplate || '').trim() || L.translationDefault;
    if (template.includes('{content}')) {
        return template.replace('{content}', content);
    }
    return `${template}\n\n${content}`;
}

async function translatePromptContent(promptId, content) {
    const settings = getFeatureSettings();
    const profileId = settings.translationProfileId;
    if (!profileId) {
        toastr.warning(L.translateNoProfile);
        return null;
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
        toastr.warning(L.translateEmpty);
        return null;
    }

    const context = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
    if (!context?.ConnectionManagerRequestService) {
        toastr.error(L.translateNoConnectionManager);
        return null;
    }

    try {
        const userPrompt = buildTranslationPrompt(content);
        const messages = [
            { role: 'system', content: 'You are a professional translator. Output ONLY the translated text without any commentary.' },
            { role: 'user', content: userPrompt },
        ];

        const response = await context.ConnectionManagerRequestService.sendRequest(
            profileId,
            messages,
            32000,
            { stream: false, extractData: true, includePreset: false, includeInstruct: false },
        );

        let translated = '';
        if (typeof response === 'string') {
            translated = response;
        } else if (response?.choices?.[0]?.message) {
            translated = response.choices[0].message.content || '';
        } else {
            translated = response?.content || response?.message || '';
        }

        translated = (translated || '').trim();
        if (!translated) throw new Error('empty response');

        setStoredTranslation(promptId, content, translated);
        toastr.success(L.translateSuccess);
        return translated;
    } catch (err) {
        console.error('[CustomPreset] Translation failed:', err);
        toastr.error(L.translateFailed(err.message || String(err)));
        return null;
    }
}

function showTranslationModal(promptId, promptName) {
    const entry = getStoredTranslation(promptId);
    if (!entry) return;

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal custom_preset_compare_modal';

    const title = document.createElement('h3');
    title.textContent = `${L.translateModalTitle}: ${promptName || ''}`;
    title.style.marginBottom = '10px';

    const originalLabel = document.createElement('label');
    originalLabel.textContent = L.translateOriginal;
    originalLabel.style.fontWeight = '600';
    originalLabel.style.marginBottom = '4px';
    originalLabel.style.display = 'block';

    const originalArea = document.createElement('textarea');
    originalArea.className = 'text_pole custom_preset_compare_textarea';
    originalArea.value = entry.original || '';
    originalArea.readOnly = true;
    originalArea.style.opacity = '0.8';

    const translatedLabel = document.createElement('label');
    translatedLabel.textContent = L.translateTranslated;
    translatedLabel.style.fontWeight = '600';
    translatedLabel.style.marginTop = '14px';
    translatedLabel.style.marginBottom = '4px';
    translatedLabel.style.display = 'block';

    const translatedArea = document.createElement('textarea');
    translatedArea.className = 'text_pole custom_preset_compare_textarea';
    translatedArea.value = entry.translated || '';
    translatedArea.readOnly = true;

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.marginTop = '10px';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'menu_button';
    closeBtn.textContent = L.cancel;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    btnRow.appendChild(closeBtn);

    modal.appendChild(title);
    modal.appendChild(originalLabel);
    modal.appendChild(originalArea);
    modal.appendChild(translatedLabel);
    modal.appendChild(translatedArea);
    modal.appendChild(btnRow);

    const stopAll = (e) => e.stopPropagation();
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
        modal.addEventListener(evt, stopAll);
        overlay.addEventListener(evt, stopAll);
    }
    overlay.addEventListener('click', () => removeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        const modalHeight = modal.offsetHeight;
        const modalWidth = modal.offsetWidth;
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;
        modal.style.top = Math.max(10, (viewH - modalHeight) / 2) + 'px';
        modal.style.left = Math.max(10, (viewW - modalWidth) / 2) + 'px';
    });
}

function ensureTranslateButtonInPopup() {
    const editPopup = document.getElementById('completion_prompt_manager_popup_edit');
    if (!editPopup) return;
    const promptLabel = editPopup.querySelector('label[for="completion_prompt_manager_popup_entry_form_prompt"]');
    if (!promptLabel) return;

    const labelContainer = promptLabel.closest('.flex1');
    if (!labelContainer) return;

    // Use the parent flex-container so buttons sit on the far right
    const flexRow = labelContainer.parentElement;
    if (!flexRow) return;

    // Remove existing buttons to refresh state
    const existing = document.getElementById('custom_preset_translate_btn_group');
    if (existing) existing.remove();

    if (!getFeatureSettings().showTranslateFeature) return;

    const saveBtn = document.getElementById('completion_prompt_manager_popup_entry_form_save');
    const promptId = saveBtn?.dataset?.pmPrompt;
    if (!promptId) return;

    const btnGroup = document.createElement('span');
    btnGroup.id = 'custom_preset_translate_btn_group';
    btnGroup.className = 'custom_preset_translate_btn_group';

    const stored = getStoredTranslation(promptId);

    const renderButtons = () => {
        btnGroup.innerHTML = '';
        const current = getStoredTranslation(promptId);

        if (!current) {
            const translateBtn = document.createElement('button');
            translateBtn.type = 'button';
            translateBtn.className = 'menu_button custom_preset_translate_btn';
            translateBtn.title = L.translate;
            translateBtn.innerHTML = `<i class="fa-solid fa-language"></i>`;
            translateBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const textarea = document.getElementById('completion_prompt_manager_popup_entry_form_prompt');
                const content = textarea?.value || '';
                translateBtn.disabled = true;
                translateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                const result = await translatePromptContent(promptId, content);
                if (result) {
                    renderButtons();
                } else {
                    translateBtn.disabled = false;
                    translateBtn.innerHTML = `<i class="fa-solid fa-language"></i>`;
                }
            });
            btnGroup.appendChild(translateBtn);
        } else {
            const promptName = (document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value || '').trim();

            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'menu_button custom_preset_translate_btn';
            viewBtn.title = L.viewTranslation;
            viewBtn.innerHTML = `<i class="fa-solid fa-book-open"></i>`;
            viewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showTranslationModal(promptId, promptName);
            });

            const retranslateBtn = document.createElement('button');
            retranslateBtn.type = 'button';
            retranslateBtn.className = 'menu_button custom_preset_translate_btn';
            retranslateBtn.title = L.retranslate;
            retranslateBtn.innerHTML = `<i class="fa-solid fa-rotate"></i>`;
            retranslateBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const textarea = document.getElementById('completion_prompt_manager_popup_entry_form_prompt');
                const content = textarea?.value || '';
                retranslateBtn.disabled = true;
                viewBtn.disabled = true;
                retranslateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                const result = await translatePromptContent(promptId, content);
                renderButtons();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'menu_button custom_preset_translate_btn custom_preset_translate_delete_btn';
            deleteBtn.title = L.deleteTranslation;
            deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm(L.deleteTranslationConfirm)) return;
                deleteStoredTranslation(promptId);
                toastr.success(L.translationDeleted);
                renderButtons();
            });

            btnGroup.appendChild(viewBtn);
            btnGroup.appendChild(retranslateBtn);
            btnGroup.appendChild(deleteBtn);
        }
    };

    renderButtons();
    flexRow.appendChild(btnGroup);
}

/**
 * Render prompt list for selected preset
 * @param {object} preset - Selected preset object
 */
function renderPromptList(preset) {
    const listContainer = document.getElementById('custom_preset_prompt_list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!preset || !preset.prompts || preset.prompts.length === 0) {
        listContainer.innerHTML = `<div class="custom_preset_empty_message">${L.noPromptsInPreset}</div>`;
        return;
    }

    // Get prompts in the correct order
    const orderedPrompts = getOrderedPrompts(preset);
    const keyword = getSearchKeyword();
    const filteredPrompts = orderedPrompts.filter(({ prompt }) => matchesSearch(prompt, keyword));

    if (orderedPrompts.length === 0) {
        listContainer.innerHTML = `<div class="custom_preset_empty_message">${L.noPromptsInPreset}</div>`;
        return;
    }

    if (filteredPrompts.length === 0) {
        listContainer.innerHTML = keyword
            ? `<div class="custom_preset_empty_message">${L.noSearchResults}</div>`
            : `<div class="custom_preset_empty_message">${L.noPromptsInPreset}</div>`;
        return;
    }

    filteredPrompts.forEach(({ prompt, isLinked }) => {
        // Skip if prompt has no name or is undefined
        if (!prompt || !prompt.name) return;

        const isMarker = prompt.marker === true;
        const item = document.createElement('div');
        item.className = 'custom_preset_prompt_item';
        if (isMarker) item.classList.add('custom_preset_prompt_marker');
        if (!isLinked) item.classList.add('custom_preset_prompt_unlinked');

        const header = document.createElement('div');
        header.className = 'custom_preset_prompt_header';

        const name = document.createElement('span');
        name.className = 'custom_preset_prompt_name';
        name.textContent = prompt.name;
        name.title = prompt.name;

        const role = document.createElement('span');
        role.className = 'custom_preset_prompt_role';
        role.textContent = prompt.role || 'system';

        let unlinkedBadge = null;
        if (!isLinked) {
            unlinkedBadge = document.createElement('span');
            unlinkedBadge.className = 'custom_preset_prompt_status';
            unlinkedBadge.textContent = L.unlinked;
            unlinkedBadge.title = L.unlinkedTitle;
        }

        const actions = document.createElement('div');
        actions.className = 'custom_preset_prompt_actions';

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'menu_button';
        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        copyBtn.title = L.copyContent;
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(prompt.content || '');
        });

        // Add button (only for non-marker prompts)
        if (!isMarker) {
            const addBtn = document.createElement('button');
            addBtn.className = 'menu_button';
            addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
            addBtn.title = L.addToManager;
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addPromptToManager(prompt);
            });
            actions.appendChild(addBtn);
        }

        actions.appendChild(copyBtn);

        // Compare button (only for non-marker prompts)
        if (!isMarker) {
            const compareBtn = document.createElement('button');
            compareBtn.className = 'menu_button';
            compareBtn.innerHTML = '<i class="fa-solid fa-code-compare"></i>';
            compareBtn.title = L.comparePrompt;
            compareBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showCompareModal(prompt);
            });
            actions.appendChild(compareBtn);
        }

        header.appendChild(name);
        header.appendChild(role);
        if (unlinkedBadge) header.appendChild(unlinkedBadge);
        header.appendChild(actions);

        // Content area (toggle)
        const content = document.createElement('div');
        content.className = 'custom_preset_prompt_content';
        content.textContent = prompt.content || (isMarker ? L.markerNoContent : L.noContent);

        // Toggle content on header click
        header.addEventListener('click', () => {
            content.classList.toggle('open');
        });

        item.appendChild(header);
        item.appendChild(content);
        listContainer.appendChild(item);
    });
}

/**
 * Handle preset selection change
 */
function onPresetSelectChange() {
    const select = document.getElementById('custom_preset_select');
    if (!select) return;

    const presetName = select.value;
    const preset = getPresetByName(presetName);
    renderPromptList(preset);
    renderQuickToggleButtons();
}

function getActivePresetName() {
    return oai_settings?.preset_settings_openai || '';
}

// ========== Linked Preset (per-chat) ==========

function showLinkedPresetModal() {
    if (!chat_metadata || typeof chat_metadata !== 'object') {
        toastr.warning(L.linkedPresetNoChatOpen);
        return;
    }

    const linked = chat_metadata.custom_preset_linked || {};
    const presetNames = getPresetNames();
    const settings = getFeatureSettings();

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal';

    const title = document.createElement('h3');
    title.textContent = L.linkedPresetTitle;
    title.style.marginBottom = '5px';

    const desc = document.createElement('p');
    desc.textContent = L.linkedPresetDesc;
    desc.style.marginBottom = '10px';
    desc.style.opacity = '0.7';
    desc.style.fontSize = '0.9em';

    // Preset select
    const presetLabel = document.createElement('label');
    presetLabel.textContent = L.linkedPresetSelect;
    presetLabel.style.display = 'block';
    presetLabel.style.marginBottom = '3px';

    const presetSelect = document.createElement('select');
    presetSelect.className = 'text_pole';
    presetSelect.style.width = '100%';
    presetSelect.style.marginBottom = '10px';

    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = L.linkedPresetNone;
    presetSelect.appendChild(noneOption);

    for (const name of presetNames) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        if (linked.presetName === name) opt.selected = true;
        presetSelect.appendChild(opt);
    }

    // Toggle preset select (conditional)
    const togglePresetLabel = document.createElement('label');
    togglePresetLabel.textContent = L.linkedPresetToggleSelect;
    togglePresetLabel.style.display = 'block';
    togglePresetLabel.style.marginBottom = '3px';

    const togglePresetSelect = document.createElement('select');
    togglePresetSelect.className = 'text_pole';
    togglePresetSelect.style.width = '100%';
    togglePresetSelect.style.marginBottom = '10px';

    const togglePresetRow = document.createElement('div');
    togglePresetRow.appendChild(togglePresetLabel);
    togglePresetRow.appendChild(togglePresetSelect);

    function updateTogglePresetSelect() {
        togglePresetSelect.innerHTML = '';
        const selectedPreset = presetSelect.value;
        if (!selectedPreset || settings.showTogglePresetFeature === false) {
            togglePresetRow.style.display = 'none';
            return;
        }
        const storage = getTogglePresetsStorage();
        const presets = storage[selectedPreset];
        if (!presets || Object.keys(presets).length <= 1) {
            togglePresetRow.style.display = 'none';
            return;
        }
        togglePresetRow.style.display = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = L.linkedPresetNone;
        togglePresetSelect.appendChild(noneOpt);
        for (const tName of Object.keys(presets)) {
            const opt = document.createElement('option');
            opt.value = tName;
            opt.textContent = tName === 'default' ? L.togglePresetDefault : tName;
            if (linked.presetName === selectedPreset && linked.togglePresetName === tName) opt.selected = true;
            togglePresetSelect.appendChild(opt);
        }
    }

    updateTogglePresetSelect();
    presetSelect.addEventListener('change', updateTogglePresetSelect);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';

    const unlinkBtn = document.createElement('button');
    unlinkBtn.type = 'button';
    unlinkBtn.className = 'menu_button';
    unlinkBtn.textContent = L.linkedPresetUnlink;
    unlinkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        delete chat_metadata.custom_preset_linked;
        saveMetadataDebounced();
        toastr.info(L.linkedPresetUnlinked);
        removeModal();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'menu_button';
    cancelBtn.textContent = L.cancel;
    cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'menu_button';
    saveBtn.textContent = L.confirm;
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedPreset = presetSelect.value;
        if (!selectedPreset) {
            delete chat_metadata.custom_preset_linked;
            saveMetadataDebounced();
            toastr.info(L.linkedPresetUnlinked);
        } else {
            const data = { presetName: selectedPreset };
            const toggleVal = togglePresetSelect.value;
            if (toggleVal && togglePresetRow.style.display !== 'none') {
                data.togglePresetName = toggleVal;
            }
            chat_metadata.custom_preset_linked = data;
            saveMetadataDebounced();
            toastr.success(L.linkedPresetSaved);
            applyLinkedPresetForChat();
        }
        removeModal();
    });

    btnRow.appendChild(unlinkBtn);
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(saveBtn);

    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(presetLabel);
    modal.appendChild(presetSelect);
    modal.appendChild(togglePresetRow);
    modal.appendChild(btnRow);

    const stopAll = (e) => e.stopPropagation();
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
        modal.addEventListener(evt, stopAll);
        overlay.addEventListener(evt, stopAll);
    }
    overlay.addEventListener('click', () => removeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        const modalHeight = modal.offsetHeight;
        const modalWidth = modal.offsetWidth;
        const viewH = window.innerHeight;
        const viewW = window.innerWidth;
        modal.style.top = Math.max(10, (viewH - modalHeight) / 2) + 'px';
        modal.style.left = Math.max(10, (viewW - modalWidth) / 2) + 'px';
    });
}

function applyLinkedPresetForChat() {
    const settings = getFeatureSettings();
    if (settings.showLinkedPresetFeature === false) return;
    if (!chat_metadata || typeof chat_metadata !== 'object') return;

    const linked = chat_metadata.custom_preset_linked;
    if (!linked?.presetName) return;

    const currentPreset = getActivePresetName();
    const presetExists = getPresetByName(linked.presetName);
    if (!presetExists) return;

    if (currentPreset !== linked.presetName) {
        const selectEl = document.getElementById('settings_preset_openai');
        if (selectEl) {
            const option = Array.from(selectEl.options).find(o => o.text === linked.presetName);
            if (option) {
                option.selected = true;
                $(selectEl).trigger('change');
                toastr.info(L.linkedPresetApplied(linked.presetName));
            }
        }
    }

    if (linked.togglePresetName && settings.showTogglePresetFeature !== false) {
        const storage = getTogglePresetsStorage();
        const presets = storage[linked.presetName];
        if (presets?.[linked.togglePresetName]) {
            setTimeout(() => {
                applyTogglePresetSnapshot(presets[linked.togglePresetName]);
                setActiveTogglePresetName(linked.presetName, linked.togglePresetName);
                populateTogglePresetSelect(linked.presetName);
            }, 300);
        }
    }
}

// ========== Prompt Preview ==========

function isPromptPreviewFeatureEnabled() {
    return getFeatureSettings().showPromptPreviewFeature !== false;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightHtml(text, keyword) {
    const escaped = escapeHtml(text);
    if (!keyword) return escaped;
    const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(safe, 'gi'), (m) => `<mark class="custom_preset_preview_mark">${m}</mark>`);
}

// Normalize a chat completion message content (string | array of parts) to text.
function normalizeMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if (typeof part.text === 'string') return part.text;
                if (part.type === 'image_url') return '[image]';
                return '';
            }
            return '';
        }).filter(Boolean).join('\n');
    }
    if (content == null) return '';
    return String(content);
}

// Which event carries the real prompt for the active API.
// (For Chat Completion, GENERATE_AFTER_COMBINE_PROMPTS also fires but with an empty text prompt.)
function getPromptEventType() {
    return main_api === 'openai'
        ? event_types.CHAT_COMPLETION_PROMPT_READY
        : event_types.GENERATE_AFTER_COMBINE_PROMPTS;
}

// Turn a *_PROMPT_READY event payload into a uniform preview result.
function parsePromptEventData(data) {
    if (Array.isArray(data?.chat)) {
        const source = data.chat;
        return {
            isChat: true,
            messages: source.map((m) => ({ role: m?.role || 'unknown', content: normalizeMessageContent(m?.content) })),
            // Preserve original (possibly multimodal) content for the raw JSON view.
            raw: source.map((m) => ({ role: m?.role || 'unknown', content: m?.content ?? '' })),
        };
    }
    const text = String(data?.prompt ?? '');
    return { isChat: false, messages: [{ role: 'prompt', content: text }], raw: text };
}

/**
 * Triggers a dry-run generation and captures the assembled prompt without sending it.
 * @returns {Promise<{isChat: boolean, messages: Array, raw: any}>}
 */
function capturePromptForPreview() {
    return new Promise((resolve, reject) => {
        let settled = false;
        let eventFired = false;
        const evt = getPromptEventType();

        const cleanup = () => {
            clearTimeout(timer);
            eventSource.removeListener(evt, onEvent);
        };
        const settle = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };
        const fail = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        };

        const onEvent = (data) => {
            if (!data || !data.dryRun) return;
            eventFired = true;
            settle(parsePromptEventData(data));
        };

        const timer = setTimeout(() => fail(new Error('Prompt preview timed out')), 20000);
        eventSource.on(evt, onEvent);

        // Dry run assembles the prompt without sending and emits the *_PROMPT_READY event.
        Promise.resolve()
            .then(() => Generate('normal', {}, true))
            .then(() => {
                // Generate returned but never emitted a prompt event -> nothing was assembled
                // (usually because no character/chat is open). Fail fast instead of waiting for timeout.
                if (!eventFired) {
                    setTimeout(() => {
                        if (!eventFired) fail(new Error('NO_PROMPT_EVENT'));
                    }, 400);
                }
            })
            .catch((e) => {
                console.error(`[${EXTENSION_NAME}] dry-run Generate error`, e);
                if (!eventFired) fail(e);
            });
    });
}

// ----- On-demand dry-run preview (wand: "프롬프트 미리보기") -----
async function runDryRunPreview() {
    toastr.info(L.promptPreviewBuilding);
    let result;
    try {
        result = await capturePromptForPreview();
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Prompt preview failed`, e);
        if (e && (e.message === 'NO_PROMPT_EVENT' || e.message === 'Prompt preview timed out')) {
            toastr.warning(L.promptPreviewNeedChat);
        } else {
            toastr.error(L.promptPreviewFailed);
        }
        return;
    }
    if (!result || !Array.isArray(result.messages) || result.messages.length === 0) {
        toastr.warning(L.promptPreviewEmpty);
        return;
    }
    result.mode = 'dryrun';
    showPromptPreviewModal(result);
}

function openPromptPreview() {
    runDryRunPreview();
}

// ----- Intercept (Prompt Inspector style): show the real prompt before every send -----
const PROMPT_INTERCEPT_KEY = 'cpm_prompt_intercept_enabled';
let interceptEnabled = localStorage.getItem(PROMPT_INTERCEPT_KEY) === 'true';
let interceptListenersBound = false;

function setInterceptEnabled(on) {
    interceptEnabled = !!on;
    localStorage.setItem(PROMPT_INTERCEPT_KEY, String(interceptEnabled));
    updatePromptInterceptMenuState();
}

function toggleIntercept() {
    setInterceptEnabled(!interceptEnabled);
    toastr.info(interceptEnabled ? L.promptInterceptOnToast : L.promptInterceptOffToast);
}

// Bound once; the handler is gated by the interceptEnabled flag (like Prompt Inspector).
// Generation pauses while the modal is open because eventSource.emit awaits async listeners.
function bindInterceptListeners() {
    if (interceptListenersBound) return;
    interceptListenersBound = true;

    const makeHandler = (evtName) => async (data) => {
        if (!interceptEnabled) return;
        if (getPromptEventType() !== evtName) return; // ignore the inactive API's event
        if (!data || data.dryRun) return;             // only the real send
        const result = parsePromptEventData(data);
        if (!result.messages.length) return;
        result.mode = 'intercept';
        await showPromptPreviewModal(result, {
            intercept: true,
            onApplyEdits: (edits) => {
                for (const { idx, newContent } of edits) {
                    if (data.chat?.[idx] != null) {
                        data.chat[idx].content = newContent;
                    }
                }
            },
            onCancel: async () => {
                try { await stopGeneration(); } catch (e) { /* noop */ }
                toastr.info(L.promptPreviewGenCancelled);
            },
        });
    };

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, makeHandler(event_types.CHAT_COMPLETION_PROMPT_READY));
    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, makeHandler(event_types.GENERATE_AFTER_COMBINE_PROMPTS));
}

function updatePromptInterceptMenuState() {
    const item = document.getElementById('custom_preset_prompt_intercept_menu_item');
    if (!item) return;
    item.classList.toggle('cpm_preview_armed', interceptEnabled);
    const icon = item.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-wand-magic-sparkles';
    const label = item.querySelector('span');
    if (label) label.textContent = interceptEnabled ? L.promptInterceptOff : L.promptInterceptOn;
}

// Returns a Promise that resolves when the modal is closed (so intercept can await it).
// options: { intercept?: boolean, onCancel?: () => void|Promise }
function showPromptPreviewModal(result, options = {}) {
  return new Promise((resolveClose) => {
    const messages = result.messages;
    // JSON.stringify escapes real line breaks as literal "\n"/"\t"; unescape them so the
    // raw view reads naturally instead of showing the backslash sequences.
    const rawText = (result.isChat
        ? JSON.stringify(result.raw ?? messages, null, 2)
        : String(result.raw ?? ''))
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    let closed = false;
    const removeModal = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
        resolveClose();
    };
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            removeModal();
        }
    };

    // Flex-centered overlay (mobile-safe): the modal is a child centered by the overlay.
    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_preview_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_preview_modal';

    const currentMode = result.mode === 'intercept' ? 'intercept' : 'dryrun';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'custom_preset_preview_header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'custom_preset_preview_titlewrap';

    const title = document.createElement('h3');
    title.textContent = L.promptPreviewTitle;

    titleWrap.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'custom_preset_preview_stats';
    const totalChars = messages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
    stats.textContent = `${L.promptPreviewMessages(messages.length)} · ${L.promptPreviewChars(totalChars)}`;

    header.appendChild(titleWrap);
    header.appendChild(stats);

    // --- Toolbar (search + actions) ---
    const toolbar = document.createElement('div');
    toolbar.className = 'custom_preset_preview_toolbar';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'custom_preset_preview_search_wrap';
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-magnifying-glass custom_preset_preview_search_icon';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'text_pole custom_preset_preview_search';
    searchInput.placeholder = L.promptPreviewSearchPlaceholder;
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);

    const actions = document.createElement('div');
    actions.className = 'custom_preset_preview_actions';

    const expandBtn = document.createElement('div');
    expandBtn.className = 'menu_button custom_preset_preview_action_btn';
    expandBtn.title = L.promptPreviewExpandAll;
    expandBtn.innerHTML = '<i class="fa-solid fa-angles-down"></i>';

    const collapseBtn = document.createElement('div');
    collapseBtn.className = 'menu_button custom_preset_preview_action_btn';
    collapseBtn.title = L.promptPreviewCollapseAll;
    collapseBtn.innerHTML = '<i class="fa-solid fa-angles-up"></i>';

    const rawBtn = document.createElement('div');
    rawBtn.className = 'menu_button custom_preset_preview_action_btn';
    rawBtn.title = L.promptPreviewToggleRaw;
    rawBtn.innerHTML = '<i class="fa-solid fa-code"></i>';

    const copyAllBtn = document.createElement('div');
    copyAllBtn.className = 'menu_button custom_preset_preview_action_btn';
    copyAllBtn.title = L.promptPreviewCopyAll;
    copyAllBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';

    actions.appendChild(expandBtn);
    actions.appendChild(collapseBtn);
    actions.appendChild(rawBtn);
    actions.appendChild(copyAllBtn);

    toolbar.appendChild(searchWrap);
    toolbar.appendChild(actions);

    // --- Card list ---
    const list = document.createElement('div');
    list.className = 'custom_preset_preview_list';

    const emptyResults = document.createElement('div');
    emptyResults.className = 'custom_preset_preview_empty';
    emptyResults.textContent = L.promptPreviewNoResults;
    emptyResults.style.display = 'none';

    const cards = messages.map((msg, idx) => buildPreviewCard(msg, idx, { editable: !!options.intercept && result.isChat }));
    cards.forEach((c) => list.appendChild(c.element));
    list.appendChild(emptyResults);

    // --- Raw (JSON) view ---
    const rawView = document.createElement('textarea');
    rawView.className = 'text_pole custom_preset_preview_raw';
    rawView.readOnly = true;
    rawView.value = rawText;
    // Inline !important so theme extensions can't shrink it or force horizontal scrolling.
    rawView.style.setProperty('height', '62vh', 'important');
    rawView.style.setProperty('min-height', '62vh', 'important');
    rawView.style.setProperty('max-height', 'none', 'important');
    rawView.style.setProperty('width', '100%', 'important');
    rawView.style.setProperty('white-space', 'pre-wrap', 'important');
    rawView.style.setProperty('word-break', 'break-word', 'important');
    rawView.style.setProperty('overflow-x', 'hidden', 'important');
    rawView.style.setProperty('overflow-y', 'auto', 'important');
    rawView.style.setProperty('box-sizing', 'border-box', 'important');
    rawView.style.display = 'none';

    let rawMode = false;
    const setRawMode = (on) => {
        rawMode = on;
        list.style.display = on ? 'none' : '';
        rawView.style.display = on ? 'block' : 'none';
        searchWrap.style.visibility = on ? 'hidden' : '';
        expandBtn.style.display = on ? 'none' : '';
        collapseBtn.style.display = on ? 'none' : '';
        rawBtn.classList.toggle('toggled', on);
        rawBtn.title = on ? L.promptPreviewViewCards : L.promptPreviewViewRaw;
    };

    const applySearch = () => {
        const keyword = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;
        for (const card of cards) {
            const hay = (card.role + '\n' + card.content).toLowerCase();
            const match = !keyword || hay.includes(keyword);
            card.element.style.display = match ? '' : 'none';
            if (match) {
                visibleCount++;
                card.renderContent(keyword);
                if (keyword) card.setCollapsed(false);
            }
        }
        emptyResults.style.display = visibleCount === 0 ? '' : 'none';
    };

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(applySearch, 120);
    });

    expandBtn.addEventListener('click', (e) => { e.stopPropagation(); cards.forEach((c) => c.setCollapsed(false)); });
    collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); cards.forEach((c) => c.setCollapsed(true)); });
    rawBtn.addEventListener('click', (e) => { e.stopPropagation(); setRawMode(!rawMode); });
    copyAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = rawMode
            ? rawText
            : messages.map((m) => `### ${m.role}\n${m.content}`).join('\n\n');
        copyToClipboard(text);
    });

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'custom_preset_preview_footer';

    if (options.intercept) {
        // Cancel left, continue right.
        footer.style.justifyContent = 'space-between';

        // Cancel the in-flight generation before it is sent (red outline, not a filled block).
        const cancelBtn = document.createElement('div');
        cancelBtn.className = 'menu_button custom_preset_preview_cancel_btn';
        cancelBtn.innerHTML = `<i class="fa-solid fa-ban"></i><span>${escapeHtml(L.promptPreviewCancelGen)}</span>`;
        // Inline !important so theme extensions can't override the outline styling.
        cancelBtn.style.setProperty('background', 'transparent', 'important');
        cancelBtn.style.setProperty('background-image', 'none', 'important');
        cancelBtn.style.setProperty('color', '#e0555a', 'important');
        cancelBtn.style.setProperty('border', '1px solid #e0555a', 'important');
        cancelBtn.style.setProperty('filter', 'none', 'important');
        cancelBtn.querySelectorAll('i, span').forEach((el) => el.style.setProperty('color', '#e0555a', 'important'));
        cancelBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try { await options.onCancel?.(); } catch (err) { /* noop */ }
            removeModal();
        });
        footer.appendChild(cancelBtn);
    }

    // Primary button keeps the theme's own menu_button colors (always readable on any theme).
    const closeBtn = document.createElement('div');
    closeBtn.className = 'menu_button';
    closeBtn.innerHTML = options.intercept
        ? `<i class="fa-solid fa-paper-plane"></i><span>${escapeHtml(L.promptPreviewContinue)}</span>`
        : `<span>${escapeHtml(L.promptPreviewClose)}</span>`;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.intercept && options.onApplyEdits) {
            const edits = cards
                .map((c, i) => c.isEdited() ? { idx: i, newContent: c.getContent() } : null)
                .filter(Boolean);
            if (edits.length) options.onApplyEdits(edits);
        }
        removeModal();
    });
    footer.appendChild(closeBtn);

    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(list);
    modal.appendChild(rawView);
    modal.appendChild(footer);

    // Close only when clicking the backdrop itself, not the panel.
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) removeModal();
    });
    document.addEventListener('keydown', onKeyDown);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    searchInput.focus();

    // --- Async token counting (updates header + each card) ---
    stats.textContent = `${L.promptPreviewMessages(messages.length)} · ${L.promptPreviewChars(totalChars)} · ${L.promptPreviewTokensCalc}`;
    (async () => {
        let totalTokens = 0;
        for (let i = 0; i < messages.length; i++) {
            let tokens = 0;
            try {
                tokens = await getTokenCountAsync(messages[i].content || '');
            } catch (e) {
                tokens = 0;
            }
            totalTokens += tokens;
            cards[i]?.setTokens(tokens);
        }
        // Modal may have been closed while counting.
        if (!modal.isConnected) return;
        stats.textContent = `${L.promptPreviewMessages(messages.length)} · ${L.promptPreviewChars(totalChars)} · ${L.promptPreviewTokens(totalTokens)}`;
    })();
  });
}

const PREVIEW_ROLE_META = {
    system: { label: 'system', cls: 'role_system', icon: 'fa-gear' },
    user: { label: 'user', cls: 'role_user', icon: 'fa-user' },
    assistant: { label: 'assistant', cls: 'role_assistant', icon: 'fa-robot' },
    tool: { label: 'tool', cls: 'role_tool', icon: 'fa-wrench' },
    prompt: { label: 'prompt', cls: 'role_prompt', icon: 'fa-align-left' },
};

function buildPreviewCard(msg, idx, options = {}) {
    const role = (msg.role || 'unknown').toLowerCase();
    const content = msg.content || '';
    const meta = PREVIEW_ROLE_META[role] || { label: role, cls: 'role_unknown', icon: 'fa-comment' };

    let editedContent = null;
    let inEditMode = false;
    const getContent = () => editedContent !== null ? editedContent : content;
    const isEdited = () => editedContent !== null;

    const card = document.createElement('div');
    card.className = `custom_preset_preview_card ${meta.cls}`;

    const cardHeader = document.createElement('div');
    cardHeader.className = 'custom_preset_preview_card_header';

    const left = document.createElement('div');
    left.className = 'custom_preset_preview_card_left';

    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down custom_preset_preview_chevron';

    const badge = document.createElement('span');
    badge.className = `custom_preset_preview_badge ${meta.cls}`;
    badge.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${escapeHtml(meta.label)}`;

    const index = document.createElement('span');
    index.className = 'custom_preset_preview_index';
    index.textContent = `#${idx + 1}`;

    const len = document.createElement('span');
    len.className = 'custom_preset_preview_len';
    len.textContent = L.promptPreviewChars(content.length);

    const tok = document.createElement('span');
    tok.className = 'custom_preset_preview_tok';

    left.appendChild(chevron);
    left.appendChild(badge);
    left.appendChild(index);
    left.appendChild(len);
    left.appendChild(tok);

    const copyBtn = document.createElement('i');
    copyBtn.className = 'fa-solid fa-copy custom_preset_preview_card_copy interactable';
    copyBtn.title = L.promptPreviewCopyCard;
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(getContent());
    });

    const cardActions = document.createElement('div');
    cardActions.className = 'custom_preset_preview_card_actions';
    cardActions.appendChild(copyBtn);

    cardHeader.appendChild(left);
    cardHeader.appendChild(cardActions);

    const body = document.createElement('div');
    body.className = 'custom_preset_preview_card_body';

    const renderContent = (keyword) => {
        if (inEditMode) return;
        const c = getContent();
        if (!c) {
            body.innerHTML = `<span class="custom_preset_preview_nocontent">${escapeHtml(L.noContent)}</span>`;
            return;
        }
        body.innerHTML = highlightHtml(c, keyword);
    };
    renderContent('');

    const setCollapsed = (collapsed) => {
        if (inEditMode) return;
        card.classList.toggle('collapsed', collapsed);
    };

    const setTokens = (n) => {
        tok.textContent = '· ' + L.promptPreviewTokens(n);
    };

    cardHeader.addEventListener('click', () => {
        if (inEditMode) return;
        card.classList.toggle('collapsed');
    });

    // Edit button — intercept mode only
    if (options.editable) {
        let editorEl = null;

        const editBtn = document.createElement('i');
        editBtn.className = 'fa-solid fa-pencil custom_preset_preview_card_edit interactable';
        editBtn.title = '수정';

        const enterEditMode = () => {
            inEditMode = true;
            card.classList.add('is_editing');
            card.classList.remove('collapsed');
            editBtn.className = 'fa-solid fa-check custom_preset_preview_card_edit interactable';
            editBtn.title = '저장';

            editorEl = document.createElement('textarea');
            editorEl.className = 'custom_preset_preview_card_editor';
            editorEl.value = getContent();
            body.style.display = 'none';
            card.appendChild(editorEl);
            editorEl.focus();
        };

        const exitEditMode = (save) => {
            if (save && editorEl) {
                const newVal = editorEl.value;
                editedContent = newVal !== content ? newVal : null;
                card.classList.toggle('is_edited', editedContent !== null);
            }
            if (editorEl) { editorEl.remove(); editorEl = null; }
            inEditMode = false;
            card.classList.remove('is_editing');
            editBtn.className = 'fa-solid fa-pencil custom_preset_preview_card_edit interactable';
            editBtn.title = '수정';
            body.style.display = '';
            renderContent('');
            len.textContent = L.promptPreviewChars(getContent().length);
        };

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (inEditMode) exitEditMode(true);
            else enterEditMode();
        });

        // Edit button sits just left of the copy button, grouped on the right.
        cardActions.insertBefore(editBtn, copyBtn);
    }

    card.appendChild(cardHeader);
    card.appendChild(body);

    return { element: card, role, content, renderContent, setCollapsed, setTokens, getContent, isEdited };
}

function createPromptPreviewMenuItem() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) return null;
    if (document.getElementById('custom_preset_prompt_preview_menu_item')) return null;

    const menuItem = document.createElement('div');
    menuItem.id = 'custom_preset_prompt_preview_menu_item';
    menuItem.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    menuItem.tabIndex = 0;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-eye';
    menuItem.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.textContent = L.promptPreview;
    menuItem.appendChild(textSpan);

    menuItem.addEventListener('click', () => {
        openPromptPreview();
    });

    extensionsMenu.appendChild(menuItem);
    return menuItem;
}

function createPromptInterceptMenuItem() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) return null;
    if (document.getElementById('custom_preset_prompt_intercept_menu_item')) return null;

    const menuItem = document.createElement('div');
    menuItem.id = 'custom_preset_prompt_intercept_menu_item';
    menuItem.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    menuItem.tabIndex = 0;
    menuItem.title = L.promptInterceptMenuTitle;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-wand-magic-sparkles';
    menuItem.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.textContent = interceptEnabled ? L.promptInterceptOff : L.promptInterceptOn;
    menuItem.appendChild(textSpan);

    menuItem.addEventListener('click', () => {
        toggleIntercept();
    });

    extensionsMenu.appendChild(menuItem);
    return menuItem;
}

// ----- Preview button next to "Prompts" in the prompt manager header -----
// The header is re-rendered by promptManager.render(), so the button is re-injected
// via a MutationObserver (see observePromptManagerHeader).
function ensurePromptManagerPreviewButton() {
    const advanced = document.querySelector('#completion_prompt_manager .completion_prompt_manager_header_advanced');
    if (!advanced) return;

    const existing = advanced.querySelector('#custom_preset_header_preview_btn');
    if (!isPromptPreviewFeatureEnabled()) {
        if (existing) existing.remove();
        return;
    }
    if (existing) return;

    const btn = document.createElement('i');
    btn.id = 'custom_preset_header_preview_btn';
    btn.className = 'fa-solid fa-wand-sparkles custom_preset_header_preview_btn interactable';
    btn.tabIndex = 0;
    btn.title = L.promptPreview;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPromptPreview();
    });
    advanced.appendChild(btn);
}

let promptManagerHeaderObserver = null;
function observePromptManagerHeader() {
    const container = document.getElementById('completion_prompt_manager');
    if (!container || promptManagerHeaderObserver) return;

    promptManagerHeaderObserver = new MutationObserver(() => {
        ensurePromptManagerPreviewButton();
    });
    promptManagerHeaderObserver.observe(container, { childList: true, subtree: true });
    ensurePromptManagerPreviewButton();
}

function createLinkedPresetMenuItem() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) return null;

    const menuItem = document.createElement('div');
    menuItem.id = 'custom_preset_linked_preset_menu_item';
    menuItem.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    menuItem.tabIndex = 0;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-link';
    menuItem.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.textContent = L.linkedPresetManage;
    menuItem.appendChild(textSpan);

    menuItem.addEventListener('click', () => {
        showLinkedPresetModal();
    });

    extensionsMenu.appendChild(menuItem);
    return menuItem;
}

function createExtensionSettingsMenu() {
    if (document.getElementById('custom_preset_settings_container')) return;

    const settingsRoot = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!settingsRoot) return;

    const settings = getFeatureSettings();
    const container = document.createElement('div');
    container.id = 'custom_preset_settings_container';
    container.className = 'extension_container custom_preset_settings';

    const drawer = document.createElement('div');
    drawer.className = 'inline-drawer';

    const drawerHeader = document.createElement('div');
    drawerHeader.className = 'inline-drawer-toggle inline-drawer-header';

    const headerTitle = document.createElement('b');
    headerTitle.textContent = L.customPresetManager;

    const headerIcon = document.createElement('div');
    headerIcon.className = 'inline-drawer-icon fa-solid fa-circle-chevron-down down interactable';
    headerIcon.tabIndex = 0;
    headerIcon.setAttribute('role', 'button');

    drawerHeader.appendChild(headerTitle);
    drawerHeader.appendChild(headerIcon);

    const drawerContent = document.createElement('div');
    drawerContent.className = 'inline-drawer-content';

    const row1 = document.createElement('label');
    row1.className = 'checkbox_label';
    row1.setAttribute('for', 'custom_preset_show_customizer_btn');
    const toggleCustomizer = document.createElement('input');
    toggleCustomizer.id = 'custom_preset_show_customizer_btn';
    toggleCustomizer.type = 'checkbox';
    toggleCustomizer.className = 'extension_enabled';
    toggleCustomizer.checked = settings.showPresetCustomizerButton !== false;
    const text1 = document.createElement('span');
    text1.innerHTML = `<strong>${L.showPresetCustomizeBtn}</strong>`;
    row1.appendChild(toggleCustomizer);
    row1.appendChild(text1);

    const note1 = document.createElement('small');
    note1.className = 'notes';
    note1.textContent = L.showPresetCustomizeBtnNote;

    const separator = document.createElement('hr');
    separator.className = 'm-t-1 m-b-1';

    const row2 = document.createElement('label');
    row2.className = 'checkbox_label';
    row2.setAttribute('for', 'custom_preset_show_quick_toggle_feature');
    const toggleQuickFeature = document.createElement('input');
    toggleQuickFeature.id = 'custom_preset_show_quick_toggle_feature';
    toggleQuickFeature.type = 'checkbox';
    toggleQuickFeature.className = 'extension_enabled';
    toggleQuickFeature.checked = settings.showQuickPromptToggleFeature !== false;
    const text2 = document.createElement('span');
    text2.innerHTML = `<strong>${L.showQuickToggle}</strong>`;
    row2.appendChild(toggleQuickFeature);
    row2.appendChild(text2);

    const note2 = document.createElement('small');
    note2.className = 'notes';
    note2.textContent = L.showQuickToggleNote;

    const row3 = document.createElement('label');
    row3.className = 'checkbox_label';
    row3.setAttribute('for', 'custom_preset_show_quick_toggle_collapse_feature');
    const toggleQuickCollapseFeature = document.createElement('input');
    toggleQuickCollapseFeature.id = 'custom_preset_show_quick_toggle_collapse_feature';
    toggleQuickCollapseFeature.type = 'checkbox';
    toggleQuickCollapseFeature.className = 'extension_enabled';
    toggleQuickCollapseFeature.checked = settings.showQuickPromptToggleCollapseFeature !== false;
    const text3 = document.createElement('span');
    text3.innerHTML = `<strong>${L.enableCollapseToggle}</strong>`;
    row3.appendChild(toggleQuickCollapseFeature);
    row3.appendChild(text3);

    const note3 = document.createElement('small');
    note3.className = 'notes';
    note3.textContent = L.enableCollapseToggleNote;

    toggleCustomizer.addEventListener('change', () => {
        settings.showPresetCustomizerButton = !!toggleCustomizer.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    toggleQuickFeature.addEventListener('change', () => {
        settings.showQuickPromptToggleFeature = !!toggleQuickFeature.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    toggleQuickCollapseFeature.addEventListener('change', () => {
        settings.showQuickPromptToggleCollapseFeature = !!toggleQuickCollapseFeature.checked;
        if (!settings.showQuickPromptToggleCollapseFeature) {
            settings.quickPromptToggleBarCollapsed = false;
        }
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const rowGroup = document.createElement('label');
    rowGroup.className = 'checkbox_label';
    rowGroup.setAttribute('for', 'custom_preset_show_quick_toggle_group_feature');
    const toggleGroupFeature = document.createElement('input');
    toggleGroupFeature.id = 'custom_preset_show_quick_toggle_group_feature';
    toggleGroupFeature.type = 'checkbox';
    toggleGroupFeature.className = 'extension_enabled';
    toggleGroupFeature.checked = settings.showQuickToggleGroupFeature === true;
    const textGroup = document.createElement('span');
    textGroup.innerHTML = `<strong>${L.enableToggleGroup}</strong>`;
    rowGroup.appendChild(toggleGroupFeature);
    rowGroup.appendChild(textGroup);

    const noteGroup = document.createElement('small');
    noteGroup.className = 'notes';
    noteGroup.textContent = L.enableToggleGroupNote;

    toggleGroupFeature.addEventListener('change', () => {
        settings.showQuickToggleGroupFeature = !!toggleGroupFeature.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
        // 프롬프트 편집창이 열려 있으면 고급 안내 문구를 즉시 반영한다.
        loadQuickToggleFormForPrompt(document.getElementById('completion_prompt_manager_popup_entry_form_save')?.dataset.pmPrompt);
    });

    const row4 = document.createElement('label');
    row4.className = 'checkbox_label';
    row4.setAttribute('for', 'custom_preset_show_position_feature');
    const togglePosition = document.createElement('input');
    togglePosition.id = 'custom_preset_show_position_feature';
    togglePosition.type = 'checkbox';
    togglePosition.className = 'extension_enabled';
    togglePosition.checked = settings.showPromptPositionFeature !== false;
    const text4 = document.createElement('span');
    text4.innerHTML = `<strong>${L.enablePositionSelect}</strong>`;
    row4.appendChild(togglePosition);
    row4.appendChild(text4);

    const note4 = document.createElement('small');
    note4.className = 'notes';
    note4.textContent = L.enablePositionSelectNote;

    togglePosition.addEventListener('change', () => {
        settings.showPromptPositionFeature = !!togglePosition.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const row5 = document.createElement('label');
    row5.className = 'checkbox_label';
    row5.setAttribute('for', 'custom_preset_show_toggle_preset_feature');
    const toggleTogglePreset = document.createElement('input');
    toggleTogglePreset.id = 'custom_preset_show_toggle_preset_feature';
    toggleTogglePreset.type = 'checkbox';
    toggleTogglePreset.className = 'extension_enabled';
    toggleTogglePreset.checked = settings.showTogglePresetFeature !== false;
    const text5 = document.createElement('span');
    text5.innerHTML = `<strong>${L.enableTogglePreset}</strong>`;
    row5.appendChild(toggleTogglePreset);
    row5.appendChild(text5);

    const note5 = document.createElement('small');
    note5.className = 'notes';
    note5.textContent = L.enableTogglePresetNote;

    toggleTogglePreset.addEventListener('change', () => {
        settings.showTogglePresetFeature = !!toggleTogglePreset.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const row6 = document.createElement('label');
    row6.className = 'checkbox_label';
    row6.setAttribute('for', 'custom_preset_show_linked_preset_feature');
    const toggleLinkedPreset = document.createElement('input');
    toggleLinkedPreset.id = 'custom_preset_show_linked_preset_feature';
    toggleLinkedPreset.type = 'checkbox';
    toggleLinkedPreset.className = 'extension_enabled';
    toggleLinkedPreset.checked = settings.showLinkedPresetFeature !== false;
    const text6 = document.createElement('span');
    text6.innerHTML = `<strong>${L.enableLinkedPreset}</strong>`;
    row6.appendChild(toggleLinkedPreset);
    row6.appendChild(text6);

    const note6 = document.createElement('small');
    note6.className = 'notes';
    note6.textContent = L.enableLinkedPresetNote;

    toggleLinkedPreset.addEventListener('change', () => {
        settings.showLinkedPresetFeature = !!toggleLinkedPreset.checked;
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    const row7 = document.createElement('label');
    row7.className = 'checkbox_label';
    row7.setAttribute('for', 'custom_preset_auto_save');
    const toggleAutoSave = document.createElement('input');
    toggleAutoSave.id = 'custom_preset_auto_save';
    toggleAutoSave.type = 'checkbox';
    toggleAutoSave.className = 'extension_enabled';
    toggleAutoSave.checked = !!settings.autoSavePreset;
    const text7 = document.createElement('span');
    text7.innerHTML = `<strong>${L.enableAutoSave}</strong>`;
    row7.appendChild(toggleAutoSave);
    row7.appendChild(text7);

    const note7 = document.createElement('small');
    note7.className = 'notes';
    note7.textContent = L.enableAutoSaveNote;

    toggleAutoSave.addEventListener('change', () => {
        settings.autoSavePreset = !!toggleAutoSave.checked;
        saveFeatureSettings();
    });

    const row8 = document.createElement('label');
    row8.className = 'checkbox_label';
    row8.setAttribute('for', 'custom_preset_auto_connect');
    const toggleAutoConnect = document.createElement('input');
    toggleAutoConnect.id = 'custom_preset_auto_connect';
    toggleAutoConnect.type = 'checkbox';
    toggleAutoConnect.className = 'extension_enabled';
    toggleAutoConnect.checked = settings.autoConnectPrompt !== false;
    const text8 = document.createElement('span');
    text8.innerHTML = `<strong>${L.enableAutoConnect}</strong>`;
    row8.appendChild(toggleAutoConnect);
    row8.appendChild(text8);

    const note8 = document.createElement('small');
    note8.className = 'notes';
    note8.textContent = L.enableAutoConnectNote;

    toggleAutoConnect.addEventListener('change', () => {
        settings.autoConnectPrompt = !!toggleAutoConnect.checked;
        saveFeatureSettings();
    });

    const rowPreview = document.createElement('label');
    rowPreview.className = 'checkbox_label';
    rowPreview.setAttribute('for', 'custom_preset_show_prompt_preview');
    const togglePromptPreview = document.createElement('input');
    togglePromptPreview.id = 'custom_preset_show_prompt_preview';
    togglePromptPreview.type = 'checkbox';
    togglePromptPreview.className = 'extension_enabled';
    togglePromptPreview.checked = settings.showPromptPreviewFeature !== false;
    const textPreview = document.createElement('span');
    textPreview.innerHTML = `<strong>${L.enablePromptPreview}</strong>`;
    rowPreview.appendChild(togglePromptPreview);
    rowPreview.appendChild(textPreview);

    const notePreview = document.createElement('small');
    notePreview.className = 'notes';
    notePreview.textContent = L.enablePromptPreviewNote;

    togglePromptPreview.addEventListener('change', () => {
        settings.showPromptPreviewFeature = !!togglePromptPreview.checked;
        if (!settings.showPromptPreviewFeature && interceptEnabled) {
            setInterceptEnabled(false);
        }
        saveFeatureSettings();
        applyFeatureVisibility();
    });

    // Translation feature section
    const translationSeparator = document.createElement('hr');
    translationSeparator.className = 'm-t-1 m-b-1';

    const row9 = document.createElement('label');
    row9.className = 'checkbox_label';
    row9.setAttribute('for', 'custom_preset_show_translate_feature');
    const toggleTranslate = document.createElement('input');
    toggleTranslate.id = 'custom_preset_show_translate_feature';
    toggleTranslate.type = 'checkbox';
    toggleTranslate.className = 'extension_enabled';
    toggleTranslate.checked = !!settings.showTranslateFeature;
    const text9 = document.createElement('span');
    text9.innerHTML = `<strong>${L.enableTranslate}</strong>`;
    row9.appendChild(toggleTranslate);
    row9.appendChild(text9);

    const note9 = document.createElement('small');
    note9.className = 'notes';
    note9.textContent = L.enableTranslateNote;

    toggleTranslate.addEventListener('change', () => {
        settings.showTranslateFeature = !!toggleTranslate.checked;
        saveFeatureSettings();
        // Toggle visibility of translation sub-options
        const subVisible = settings.showTranslateFeature ? '' : 'none';
        translationProfileLabel.style.display = subVisible || 'block';
        translationProfileSelect.style.display = subVisible;
        translationProfileNote.style.display = subVisible;
        translationTemplateLabel.style.display = subVisible || 'block';
        translationTemplateArea.style.display = subVisible;
        translationTemplateNote.style.display = subVisible;
    });

    const translationProfileLabel = document.createElement('label');
    translationProfileLabel.setAttribute('for', 'custom_preset_translation_profile');
    translationProfileLabel.innerHTML = `<strong>${L.translationProfile}</strong>`;
    translationProfileLabel.style.display = 'block';
    translationProfileLabel.style.marginBottom = '4px';

    const translationProfileSelect = document.createElement('select');
    translationProfileSelect.id = 'custom_preset_translation_profile';
    translationProfileSelect.className = 'text_pole';

    const translationProfileNote = document.createElement('small');
    translationProfileNote.className = 'notes';
    translationProfileNote.textContent = L.translationProfileNote;

    const translationTemplateLabel = document.createElement('label');
    translationTemplateLabel.setAttribute('for', 'custom_preset_translation_template');
    translationTemplateLabel.innerHTML = `<strong>${L.translationPromptTemplate}</strong>`;
    translationTemplateLabel.style.display = 'block';
    translationTemplateLabel.style.marginTop = '10px';
    translationTemplateLabel.style.marginBottom = '4px';

    const translationTemplateArea = document.createElement('textarea');
    translationTemplateArea.id = 'custom_preset_translation_template';
    translationTemplateArea.className = 'text_pole';
    translationTemplateArea.rows = 4;
    if (typeof settings.translationPromptTemplate !== 'string' || settings.translationPromptTemplate === '') {
        settings.translationPromptTemplate = L.translationDefault;
        saveFeatureSettings();
    }
    translationTemplateArea.value = settings.translationPromptTemplate;
    translationTemplateArea.addEventListener('input', () => {
        settings.translationPromptTemplate = translationTemplateArea.value;
        saveFeatureSettings();
    });

    const translationTemplateNote = document.createElement('small');
    translationTemplateNote.className = 'notes';
    translationTemplateNote.textContent = L.translationPromptTemplateNote;

    drawerContent.appendChild(row1);
    drawerContent.appendChild(note1);
    // drawerContent.appendChild(separator);
    drawerContent.appendChild(row2);
    drawerContent.appendChild(note2);
    drawerContent.appendChild(row3);
    drawerContent.appendChild(note3);
    drawerContent.appendChild(rowGroup);
    drawerContent.appendChild(noteGroup);
    drawerContent.appendChild(row4);
    drawerContent.appendChild(note4);
    drawerContent.appendChild(row5);
    drawerContent.appendChild(note5);
    drawerContent.appendChild(row6);
    drawerContent.appendChild(note6);
    drawerContent.appendChild(row7);
    drawerContent.appendChild(note7);
    drawerContent.appendChild(row8);
    drawerContent.appendChild(note8);
    drawerContent.appendChild(rowPreview);
    drawerContent.appendChild(notePreview);
    drawerContent.appendChild(translationSeparator);
    drawerContent.appendChild(row9);
    drawerContent.appendChild(note9);
    drawerContent.appendChild(translationProfileLabel);
    drawerContent.appendChild(translationProfileSelect);
    drawerContent.appendChild(translationProfileNote);
    drawerContent.appendChild(translationTemplateLabel);
    drawerContent.appendChild(translationTemplateArea);
    drawerContent.appendChild(translationTemplateNote);
    drawer.appendChild(drawerHeader);
    drawer.appendChild(drawerContent);
    container.appendChild(drawer);
    settingsRoot.appendChild(container);

    // Initialize Connection Profile dropdown
    try {
        const context = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
        if (context?.ConnectionManagerRequestService) {
            context.ConnectionManagerRequestService.handleDropdown(
                '#custom_preset_translation_profile',
                settings.translationProfileId || '',
                (profile) => {
                    settings.translationProfileId = profile?.id ?? '';
                    saveFeatureSettings();
                },
            );
        }
    } catch (e) {
        console.warn('[CustomPreset] Connection Manager not available:', e);
    }

    // Initial visibility for translation sub-options
    const subVisible = settings.showTranslateFeature ? '' : 'none';
    translationProfileLabel.style.display = subVisible || 'block';
    translationProfileSelect.style.display = subVisible;
    translationProfileNote.style.display = subVisible;
    translationTemplateLabel.style.display = subVisible || 'block';
    translationTemplateArea.style.display = subVisible;
    translationTemplateNote.style.display = subVisible;
}

function applyFeatureVisibility() {
    const settings = getFeatureSettings();
    const customizerBtn = document.getElementById('custom_preset_toggle_btn');
    const panel = document.getElementById('custom_preset_panel');

    if (customizerBtn) {
        customizerBtn.style.display = settings.showPresetCustomizerButton !== false ? '' : 'none';
    }

    if (settings.showPresetCustomizerButton === false && panel) {
        panel.classList.remove('open');
        isPanelOpen = false;
    }

    const quickBlock = document.getElementById('custom_preset_quick_toggle_block');
    if (quickBlock) {
        quickBlock.style.display = settings.showQuickPromptToggleFeature !== false ? '' : 'none';
    }

    const positionBlock = document.getElementById('custom_preset_position_block');
    if (positionBlock) {
        positionBlock.style.display = settings.showPromptPositionFeature !== false ? '' : 'none';
    }

    const togglePresetSection = document.getElementById('custom_preset_toggle_preset_section');
    if (togglePresetSection) {
        togglePresetSection.style.display = settings.showTogglePresetFeature !== false ? '' : 'none';
    }

    const toggleGroupSection = document.getElementById('custom_preset_toggle_group_section');
    if (toggleGroupSection) {
        toggleGroupSection.style.display = isQuickToggleGroupFeatureEnabled() ? '' : 'none';
    }

    const linkedPresetMenuItem = document.getElementById('custom_preset_linked_preset_menu_item');
    if (linkedPresetMenuItem) {
        linkedPresetMenuItem.style.display = settings.showLinkedPresetFeature !== false ? '' : 'none';
    }

    const promptPreviewMenuItem = document.getElementById('custom_preset_prompt_preview_menu_item');
    if (promptPreviewMenuItem) {
        promptPreviewMenuItem.style.display = settings.showPromptPreviewFeature !== false ? '' : 'none';
    }

    const promptInterceptMenuItem = document.getElementById('custom_preset_prompt_intercept_menu_item');
    if (promptInterceptMenuItem) {
        promptInterceptMenuItem.style.display = settings.showPromptPreviewFeature !== false ? '' : 'none';
    }

    ensurePromptManagerPreviewButton();

    if (settings.showQuickPromptToggleCollapseFeature === false && settings.quickPromptToggleBarCollapsed) {
        settings.quickPromptToggleBarCollapsed = false;
        saveFeatureSettings();
    }

    renderQuickToggleButtons();
}

/**
 * Toggle panel visibility
 */
function togglePanel() {
    isPanelOpen = !isPanelOpen;

    const panel = document.getElementById('custom_preset_panel');
    const btn = document.getElementById('custom_preset_toggle_btn');

    if (panel) {
        panel.classList.toggle('open', isPanelOpen);
    }

    if (btn) {
        btn.textContent = isPanelOpen ? L.closePresetCustom : L.openPresetCustom;
    }

    // Refresh preset list when opening
    if (isPanelOpen) {
        populatePresetSelect();
        populateTogglePresetSelect(getActivePresetName());
    }
}

/**
 * Populate preset select dropdown
 */
function populatePresetSelect() {
    const select = document.getElementById('custom_preset_select');
    if (!select) return;

    const presetNames = getPresetNames();
    select.innerHTML = '';

    if (presetNames.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = L.noPresets;
        select.appendChild(option);
        return;
    }

    presetNames.forEach((name) => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });

    // Trigger initial render
    onPresetSelectChange();
}

/**
 * Create and inject UI
 */
function createUI() {
    const promptManagerContainer = document.getElementById('completion_prompt_manager');
    if (!promptManagerContainer) {
        console.warn(`[${EXTENSION_NAME}] completion_prompt_manager not found`);
        return;
    }

    // Check if already injected
    if (document.getElementById('custom_preset_container')) {
        return;
    }

    // Create container
    const container = document.createElement('div');
    container.id = 'custom_preset_container';

    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'custom_preset_toggle_btn';
    toggleBtn.className = 'menu_button';
    toggleBtn.textContent = L.openPresetCustom;
    toggleBtn.addEventListener('click', togglePanel);

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'custom_preset_panel';

    // Create preset select
    const selectLabel = document.createElement('label');
    selectLabel.textContent = L.selectPreset;
    selectLabel.style.display = 'block';
    selectLabel.style.marginBottom = '5px';

    const select = document.createElement('select');
    select.id = 'custom_preset_select';
    select.className = 'text_pole';
    select.addEventListener('change', onPresetSelectChange);

    // Create search controls
    const searchRow = document.createElement('div');
    searchRow.className = 'custom_preset_search_row';

    const searchInput = document.createElement('input');
    searchInput.id = 'custom_preset_search_input';
    searchInput.className = 'text_pole';
    searchInput.type = 'text';
    searchInput.placeholder = L.searchPlaceholder;
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            triggerSearch();
        }
    });

    const searchBtn = document.createElement('button');
    searchBtn.id = 'custom_preset_search_btn';
    searchBtn.className = 'menu_button';
    searchBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> ${L.search}`;
    searchBtn.addEventListener('click', triggerSearch);

    const clearBtn = document.createElement('button');
    clearBtn.id = 'custom_preset_clear_btn';
    clearBtn.className = 'menu_button';
    clearBtn.textContent = L.reset;
    clearBtn.addEventListener('click', clearSearch);

    searchRow.appendChild(searchInput);
    searchRow.appendChild(searchBtn);
    searchRow.appendChild(clearBtn);

    // Create prompt list container
    const promptList = document.createElement('div');
    promptList.id = 'custom_preset_prompt_list';
    promptList.className = 'custom_preset_prompt_list';

    // Toggle preset section (outside panel - works with active preset)
    const togglePresetSection = createTogglePresetUI();
    const toggleGroupSection = createQuickToggleGroupUI();

    // Assemble panel
    panel.appendChild(selectLabel);
    panel.appendChild(select);
    panel.appendChild(searchRow);
    panel.appendChild(promptList);

    // Assemble container
    container.appendChild(toggleBtn);
    container.appendChild(panel);
    container.appendChild(togglePresetSection);
    container.appendChild(toggleGroupSection);

    // Insert before prompt manager
    promptManagerContainer.parentNode.insertBefore(container, promptManagerContainer);
}

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
    ensureQuickToggleCollapseButton();
    applyFeatureVisibility();
    renderQuickToggleButtons();
    populateTogglePresetSelect(getActivePresetName());
    // 재시작 시 커넥션/프리셋 재적용으로 토글이 프리셋 원본으로 덮여쓰이는 경우 대비
    reapplyActiveTogglePreset(getActivePresetName());

    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        if (isPanelOpen) populatePresetSelect();
        const presetName = getActivePresetName();
        populateTogglePresetSelect(presetName);
        reapplyActiveTogglePreset(presetName);
        renderQuickToggleButtons();
    });

    eventSource.on(event_types.CHAT_CHANGED, () => {
        renderQuickToggleButtons();
        applyLinkedPresetForChat();
    });

    console.log(`[${EXTENSION_NAME}] Initialized successfully`);
}

// Initialize when jQuery is ready
jQuery(async () => {
    await init();
});

