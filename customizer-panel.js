// 프리셋 커스터마이저 패널 껍데기: 열고 닫기, 프리셋 선택, UI 조립.
import { EXTENSION_NAME } from './constants.js';
import { getActivePresetName, getPresetByName, getPresetNames } from './preset-utils.js';
import { clearSearch, renderPromptList, triggerSearch } from './prompt-list.js';
import { createQuickToggleGroupUI, renderQuickToggleButtons } from './quick-toggle.js';
import { createTogglePresetUI, populateTogglePresetSelect } from './toggle-preset.js';
import { L } from './translations.js';

// 패널 열림 상태는 이 모듈만 바꾼다.
// export let로 내보내면 다른 모듈이 대입할 수 없고(ESM 바인딩은 읽기 전용) 대입 시
// 런타임 TypeError가 나므로, 읽기/닫기를 함수로 노출한다.
let isPanelOpen = false;

export function isCustomizerPanelOpen() {
    return isPanelOpen;
}

/**
 * 패널을 닫는다. DOM과 상태를 함께 되돌리므로 밖에서 class를 직접 건드릴 필요가 없다.
 */
export function closeCustomizerPanel() {
    const panel = document.getElementById('custom_preset_panel');
    if (panel) panel.classList.remove('open');
    isPanelOpen = false;
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

// ========== Linked Preset (per-chat) ==========

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
export function populatePresetSelect() {
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
export function createUI() {
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
