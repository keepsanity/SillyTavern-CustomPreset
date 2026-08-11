// 프리셋 커스터마이저의 프롬프트 목록 렌더링과 검색.
// 패널 껍데기(customizer-panel)와 분리해 두어야 다른 기능이 목록만 갱신할 수 있다.
import { saveSettingsDebounced } from '../../../../script.js';
import { getActivePromptManagerPreset, getOrderedPrompts, getPresetByName } from './preset-utils.js';
import { addPromptToManager } from './prompt-position.js';
import { getFeatureSettings } from './settings-store.js';
import { copyToClipboard, matchesSearch } from './shared.js';
import { L } from './translations.js';

function getSearchKeyword() {
    const searchInput = document.getElementById('custom_preset_search_input');
    return (searchInput?.value || '').trim().toLowerCase();
}

export function triggerSearch() {
    const select = document.getElementById('custom_preset_select');
    if (!select) return;
    const preset = getPresetByName(select.value);
    renderPromptList(preset);
}

export function clearSearch() {
    const searchInput = document.getElementById('custom_preset_search_input');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    triggerSearch();
}


// ========== Toggle Preset Data Helpers ==========

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

/**
 * Render prompt list for selected preset
 * @param {object} preset - Selected preset object
 */
export function renderPromptList(preset) {
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
