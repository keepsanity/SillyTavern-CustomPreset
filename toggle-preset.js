// 토글 프리셋: 프롬프트 on/off 조합을 이름 붙여 저장하고 전환한다.
// 같은 프리셋 안에서만 쓰이며, 저장 위치는 확장 설정(로컬)이다.
import { promptManager } from '../../../openai.js';
import { GLOBAL_PROMPT_CHARACTER_ID } from './constants.js';
import { getActivePresetName, getPresetByName } from './preset-utils.js';
import { renderPromptList } from './prompt-list.js';
import { renderQuickToggleButtons } from './quick-toggle.js';
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { L } from './translations.js';

export function getTogglePresetsStorage() {
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

export function setActiveTogglePresetName(presetName, togglePresetName) {
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

export function applyTogglePresetSnapshot(snapshot) {
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
export function reapplyActiveTogglePreset(presetName) {
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

export function populateTogglePresetSelect(presetName) {
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

export function createTogglePresetUI() {
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
