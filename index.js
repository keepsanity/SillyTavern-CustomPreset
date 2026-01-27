import { openai_settings, openai_setting_names, promptManager } from '../../../openai.js';
import { uuidv4 } from '../../../utils.js';

const EXTENSION_NAME = 'SillyTavern-CustomPreset';

let isPanelOpen = false;

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
 * Get ordered prompts based on prompt_order
 * @param {object} preset - Preset object
 * @returns {object[]} Ordered array of prompts
 */
function getOrderedPrompts(preset) {
    if (!preset || !preset.prompts) return [];

    // Find prompt_order for the global/dummy character (100001)
    const promptOrderEntry = preset.prompt_order?.find(entry => entry.character_id === 100001);

    if (promptOrderEntry && promptOrderEntry.order && promptOrderEntry.order.length > 0) {
        // Return prompts in the order specified by prompt_order
        const orderedPrompts = [];
        for (const orderItem of promptOrderEntry.order) {
            const prompt = getPromptByIdentifier(preset.prompts, orderItem.identifier);
            if (prompt) {
                orderedPrompts.push(prompt);
            }
        }
        return orderedPrompts;
    }

    // Fallback: return prompts as-is
    return preset.prompts.filter(p => p && p.name);
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

    if (orderedPrompts.length === 0) {
        listContainer.innerHTML = '<div class="custom_preset_empty_message">이 프리셋에는 프롬프트가 없습니다.</div>';
        return;
    }

    orderedPrompts.forEach((prompt, index) => {
        // Skip if prompt has no name or is undefined
        if (!prompt || !prompt.name) return;

        const isMarker = prompt.marker === true;
        const item = document.createElement('div');
        item.className = 'custom_preset_prompt_item';
        if (isMarker) item.classList.add('custom_preset_prompt_marker');

        const header = document.createElement('div');
        header.className = 'custom_preset_prompt_header';

        const name = document.createElement('span');
        name.className = 'custom_preset_prompt_name';
        name.textContent = prompt.name;
        name.title = prompt.name;

        const role = document.createElement('span');
        role.className = 'custom_preset_prompt_role';
        role.textContent = prompt.role || 'system';

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

    // Create prompt list container
    const promptList = document.createElement('div');
    promptList.id = 'custom_preset_prompt_list';
    promptList.className = 'custom_preset_prompt_list';

    // Assemble panel
    panel.appendChild(selectLabel);
    panel.appendChild(select);
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
    console.log(`[${EXTENSION_NAME}] Initialized successfully`);
}

// Initialize when jQuery is ready
jQuery(async () => {
    await init();
});

