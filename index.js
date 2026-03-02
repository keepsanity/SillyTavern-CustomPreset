import { openai_settings, openai_setting_names, oai_settings, promptManager } from '../../../openai.js';
import { uuidv4 } from '../../../utils.js';
import { extension_settings } from '../../../extensions.js';
import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';

const EXTENSION_NAME = 'SillyTavern-CustomPreset';
const QUICK_TOGGLE_NAME_KEY = 'quick_prompt_toggle_name';
const QUICK_TOGGLE_ENABLED_KEY = 'quick_prompt_toggle_enabled';
const FEATURE_DEFAULTS = {
    showPresetCustomizerButton: true,
    showQuickPromptToggleFeature: true,
};

let isPanelOpen = false;
let quickPopupObserver = null;

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
        extension_settings[EXTENSION_NAME] = { ...FEATURE_DEFAULTS };
    }
    return extension_settings[EXTENSION_NAME];
}

function saveFeatureSettings() {
    extension_settings[EXTENSION_NAME] = getFeatureSettings();
    saveSettingsDebounced();
}

function isQuickToggleFeatureEnabled() {
    return getFeatureSettings().showQuickPromptToggleFeature !== false;
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
    quickRow.className = 'flex-container gap10px';

    const quickBlock = document.createElement('div');
    quickBlock.id = 'custom_preset_quick_toggle_block';
    quickBlock.className = 'completion_prompt_manager_popup_entry_form_control flex1';

    const title = document.createElement('label');
    title.textContent = '빠른 프롬프트 토글';
    title.style.display = 'block';
    title.style.marginBottom = '5px';

    const row = document.createElement('div');
    row.className = 'custom_preset_quick_toggle_row';

    const nameInput = document.createElement('input');
    nameInput.id = 'custom_preset_quick_toggle_name';
    nameInput.className = 'text_pole';
    nameInput.type = 'text';
    nameInput.placeholder = '토글 버튼 이름';

    const enableLabel = document.createElement('label');
    enableLabel.className = 'checkbox_label custom_preset_quick_toggle_checkbox';
    enableLabel.title = '체크 시 빠른 토글 버튼 표시';

    const enableCheckbox = document.createElement('input');
    enableCheckbox.id = 'custom_preset_quick_toggle_enabled';
    enableCheckbox.type = 'checkbox';

    const enableText = document.createElement('span');
    enableText.textContent = '사용';

    enableLabel.appendChild(enableCheckbox);
    enableLabel.appendChild(enableText);
    row.appendChild(nameInput);
    row.appendChild(enableLabel);
    quickBlock.appendChild(title);
    quickBlock.appendChild(row);
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
    const nameInput = document.getElementById('custom_preset_quick_toggle_name');
    const enabledInput = document.getElementById('custom_preset_quick_toggle_enabled');
    const quickBlock = document.getElementById('custom_preset_quick_toggle_block');
    if (!nameInput || !enabledInput || !quickBlock) return;

    quickBlock.style.display = isQuickToggleFeatureEnabled() ? '' : 'none';

    const prompt = promptManager?.getPromptById?.(promptId);
    if (!prompt) {
        nameInput.value = '';
        enabledInput.checked = false;
        return;
    }

    nameInput.value = (prompt[QUICK_TOGGLE_NAME_KEY] || '').trim();
    enabledInput.checked = !!prompt[QUICK_TOGGLE_ENABLED_KEY];
}

function applyQuickToggleDataToPrompt(promptId, quickData) {
    const prompt = promptManager?.getPromptById?.(promptId);
    if (!prompt) return;
    prompt[QUICK_TOGGLE_NAME_KEY] = quickData.name;
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
        setTimeout(() => applyQuickToggleDataToPrompt(promptId, quickData), 0);
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
            toastr.success('클립보드에 복사되었습니다.');
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
            toastr.success('클립보드에 복사되었습니다.');
        } else {
            toastr.error('복사에 실패했습니다.');
        }
    } catch (err) {
        console.error('Failed to copy:', err);
        toastr.error('복사에 실패했습니다.');
    }
}

/**
 * Add prompt to current prompt manager
 * @param {object} prompt - Prompt object to add
 */
function addPromptToManager(prompt) {
    if (!promptManager) {
        toastr.error('프롬프트 매니저가 초기화되지 않았습니다.');
        return;
    }

    // Generate a new unique identifier
    const newIdentifier = uuidv4();

    // Create a copy of the prompt with a new identifier
    const newPrompt = {
        ...prompt,
        identifier: newIdentifier,
        system_prompt: false, // User-added prompts are not system prompts
    };

    // Add the prompt to the prompts array
    promptManager.addPrompt(newPrompt, newIdentifier);

    // Append to current character's prompt order
    const addedPrompt = promptManager.getPromptById(newIdentifier);
    if (addedPrompt && promptManager.activeCharacter) {
        promptManager.appendPrompt(addedPrompt, promptManager.activeCharacter);
    }

    // Save and re-render
    promptManager.saveServiceSettings();
    promptManager.render();

    toastr.success(`프롬프트 "${prompt.name}"이(가) 추가되었습니다.`);
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
    const promptOrderEntry = preset.prompt_order?.find(entry => entry.character_id === 100001);
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

function getLinkedQuickTogglePrompts(preset) {
    if (!preset) return [];
    return getOrderedPrompts(preset)
        .filter(({ prompt, isLinked }) =>
            isLinked &&
            !!prompt[QUICK_TOGGLE_ENABLED_KEY] &&
            !!String(prompt[QUICK_TOGGLE_NAME_KEY] || '').trim(),
        );
}

function togglePromptEnabledByIdentifier(preset, identifier) {
    const promptOrderEntry = preset?.prompt_order?.find(entry => entry.character_id === 100001);
    if (!promptOrderEntry?.order) return;
    const target = promptOrderEntry.order.find(item => item.identifier === identifier);
    if (!target) return;
    target.enabled = !target.enabled;
    promptManager?.saveServiceSettings?.();
    promptManager?.render?.();
}

function renderQuickToggleButtons() {
    const existingBar = document.getElementById('custom_preset_quick_toggle_bar');
    if (existingBar) existingBar.remove();

    if (!isQuickToggleFeatureEnabled()) return;

    const sendForm = document.getElementById('send_form');
    if (!sendForm) return;

    const preset = getActivePromptManagerPreset();
    const quickPrompts = getLinkedQuickTogglePrompts(preset);
    if (quickPrompts.length === 0) return;

    const bar = document.createElement('div');
    bar.id = 'custom_preset_quick_toggle_bar';
    bar.className = 'custom_preset_quick_toggle_bar';

    quickPrompts.forEach(({ prompt, isEnabled }) => {
        const button = document.createElement('button');
        button.className = 'menu_button custom_preset_quick_toggle_button';
        if (!isEnabled) button.classList.add('is_disabled');
        button.textContent = String(prompt[QUICK_TOGGLE_NAME_KEY]).trim();
        button.title = `프롬프트 "${prompt.name}" 토글`;
        button.addEventListener('click', () => {
            togglePromptEnabledByIdentifier(getActivePromptManagerPreset(), prompt.identifier);
            renderQuickToggleButtons();
        });
        bar.appendChild(button);
    });

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
 * Render prompt list for selected preset
 * @param {object} preset - Selected preset object
 */
function renderPromptList(preset) {
    const listContainer = document.getElementById('custom_preset_prompt_list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (!preset || !preset.prompts || preset.prompts.length === 0) {
        listContainer.innerHTML = '<div class="custom_preset_empty_message">이 프리셋에는 프롬프트가 없습니다.</div>';
        return;
    }

    // Get prompts in the correct order
    const orderedPrompts = getOrderedPrompts(preset);
    const keyword = getSearchKeyword();
    const filteredPrompts = orderedPrompts.filter(({ prompt }) => matchesSearch(prompt, keyword));

    if (orderedPrompts.length === 0) {
        listContainer.innerHTML = '<div class="custom_preset_empty_message">이 프리셋에는 프롬프트가 없습니다.</div>';
        return;
    }

    if (filteredPrompts.length === 0) {
        listContainer.innerHTML = keyword
            ? '<div class="custom_preset_empty_message">검색 결과가 없습니다.</div>'
            : '<div class="custom_preset_empty_message">이 프리셋에는 프롬프트가 없습니다.</div>';
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
            unlinkedBadge.textContent = '미연결';
            unlinkedBadge.title = 'prompt_order(character_id: 100001)에 연결되지 않은 프롬프트';
        }

        const actions = document.createElement('div');
        actions.className = 'custom_preset_prompt_actions';

        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'menu_button';
        copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';
        copyBtn.title = '내용 복사';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            copyToClipboard(prompt.content || '');
        });

        // Add button (only for non-marker prompts)
        if (!isMarker) {
            const addBtn = document.createElement('button');
            addBtn.className = 'menu_button';
            addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
            addBtn.title = '프롬프트 매니저에 추가';
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                addPromptToManager(prompt);
            });
            actions.appendChild(addBtn);
        }

        actions.appendChild(copyBtn);

        header.appendChild(name);
        header.appendChild(role);
        if (unlinkedBadge) header.appendChild(unlinkedBadge);
        header.appendChild(actions);

        // Content area (toggle)
        const content = document.createElement('div');
        content.className = 'custom_preset_prompt_content';
        content.textContent = prompt.content || (isMarker ? '(마커 - 내용 없음)' : '(내용 없음)');

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
    headerTitle.textContent = '커스텀 프리셋 매니저';

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
    text1.innerHTML = '<strong>프리셋 커스텀하기 버튼 표시</strong>';
    row1.appendChild(toggleCustomizer);
    row1.appendChild(text1);

    const note1 = document.createElement('small');
    note1.className = 'notes';
    note1.textContent = '프롬프트 매니저 상단의 "프리셋 커스텀하기" 버튼을 표시/숨김합니다.';

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
    text2.innerHTML = '<strong>빠른 프롬프트 토글 표시</strong>';
    row2.appendChild(toggleQuickFeature);
    row2.appendChild(text2);

    const note2 = document.createElement('small');
    note2.className = 'notes';
    note2.textContent = '프롬프트 편집의 빠른 토글 항목과 인풋 위 토글 버튼을 표시/숨김합니다.';

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

    drawerContent.appendChild(row1);
    drawerContent.appendChild(note1);
    // drawerContent.appendChild(separator);
    drawerContent.appendChild(row2);
    drawerContent.appendChild(note2);
    drawer.appendChild(drawerHeader);
    drawer.appendChild(drawerContent);
    container.appendChild(drawer);
    settingsRoot.appendChild(container);
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
        btn.textContent = isPanelOpen ? '프리셋 커스텀 닫기' : '프리셋 커스텀하기';
    }

    // Refresh preset list when opening
    if (isPanelOpen) {
        populatePresetSelect();
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
        option.textContent = '프리셋이 없습니다';
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
    toggleBtn.textContent = '프리셋 커스텀하기';
    toggleBtn.addEventListener('click', togglePanel);

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'custom_preset_panel';

    // Create preset select
    const selectLabel = document.createElement('label');
    selectLabel.textContent = '프리셋 선택:';
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
    searchInput.placeholder = '프롬프트 검색 (이름/role/내용)';
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            triggerSearch();
        }
    });

    const searchBtn = document.createElement('button');
    searchBtn.id = 'custom_preset_search_btn';
    searchBtn.className = 'menu_button';
    searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> 검색';
    searchBtn.addEventListener('click', triggerSearch);

    const clearBtn = document.createElement('button');
    clearBtn.id = 'custom_preset_clear_btn';
    clearBtn.className = 'menu_button';
    clearBtn.textContent = '초기화';
    clearBtn.addEventListener('click', clearSearch);

    searchRow.appendChild(searchInput);
    searchRow.appendChild(searchBtn);
    searchRow.appendChild(clearBtn);

    // Create prompt list container
    const promptList = document.createElement('div');
    promptList.id = 'custom_preset_prompt_list';
    promptList.className = 'custom_preset_prompt_list';

    // Assemble panel
    panel.appendChild(selectLabel);
    panel.appendChild(select);
    panel.appendChild(searchRow);
    panel.appendChild(promptList);

    // Assemble container
    container.appendChild(toggleBtn);
    container.appendChild(panel);

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
    ensureQuickTogglePopupControls();
    observePromptPopupChanges();
    applyFeatureVisibility();
    renderQuickToggleButtons();

    eventSource.on(event_types.OAI_PRESET_CHANGED_AFTER, () => {
        if (isPanelOpen) populatePresetSelect();
        renderQuickToggleButtons();
    });

    console.log(`[${EXTENSION_NAME}] Initialized successfully`);
}

// Initialize when jQuery is ready
jQuery(async () => {
    await init();
});

