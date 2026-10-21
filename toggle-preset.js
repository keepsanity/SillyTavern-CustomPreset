// 토글 프리셋: 프롬프트 on/off 조합을 이름 붙여 저장하고 전환한다.
// 같은 프리셋 안에서만 쓰이며, 조합은 사용자별 파일에 저장한다.
import { promptManager } from '../../../openai.js';
import { GLOBAL_PROMPT_CHARACTER_ID } from './constants.js';
import { getActivePresetName, getPresetByName } from './preset-utils.js';
import { renderPromptList } from './prompt-list.js';
import { renderQuickToggleButtons } from './quick-toggle.js';
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { L } from './translations.js';

import { getTogglePresetsStorage, updateTogglePresets, reportToggleStorageError } from './toggle-storage.js';
export { getTogglePresetsStorage };

function getActiveTogglePresetTracker() {
    const settings = getFeatureSettings();
    if (!settings.activeTogglePreset || typeof settings.activeTogglePreset !== 'object') {
        settings.activeTogglePreset = {};
    }
    return settings.activeTogglePreset;
}

async function getTogglePresetsForPreset(presetName) {
    if (!presetName) return {};
    if (!Object.hasOwn(getTogglePresetsStorage(), presetName)) {
        const snapshot = captureCurrentToggleState();
        await updateTogglePresets(storage => {
            if (!Object.hasOwn(storage, presetName)) {
                Object.defineProperty(storage, presetName, {
                    value: { default: snapshot }, enumerable: true, writable: true, configurable: true,
                });
            }
        });
    }
    return getTogglePresetsStorage()[presetName];
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
        if (Object.hasOwn(snapshot, item.identifier)) {
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
    const presets = getTogglePresetsStorage()[presetName] || {};
    if (presets[active]) {
        applyTogglePresetSnapshot(presets[active]);
    }
}

// ========== Toggle Preset CRUD ==========

async function createTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const name = prompt(L.togglePresetNew);
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    const snapshot = captureCurrentToggleState();
    const presets = await getTogglePresetsForPreset(presetName);
    if (Object.hasOwn(presets, trimmed)) {
        toastr.warning(L.togglePresetNameExists);
        return;
    }
    await updateTogglePresets(storage => {
        Object.defineProperty(storage[presetName], trimmed, {
            value: snapshot, enumerable: true, writable: true, configurable: true,
        });
    });
    setActiveTogglePresetName(presetName, trimmed);
    saveFeatureSettings();
    await populateTogglePresetSelect(getActivePresetName());
    toastr.success(L.togglePresetCreated(trimmed));
}

async function renameTogglePreset() {
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
    const presets = await getTogglePresetsForPreset(presetName);
    if (Object.hasOwn(presets, trimmed)) {
        toastr.warning(L.togglePresetNameExists);
        return;
    }
    await updateTogglePresets(storage => {
        Object.defineProperty(storage[presetName], trimmed, {
            value: storage[presetName][current], enumerable: true, writable: true, configurable: true,
        });
        delete storage[presetName][current];
    });
    setActiveTogglePresetName(presetName, trimmed);
    saveFeatureSettings();
    await populateTogglePresetSelect(getActivePresetName());
    toastr.success(L.togglePresetRenamed(current, trimmed));
}

async function deleteTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const current = getActiveTogglePresetName(presetName);
    if (current === 'default') {
        toastr.warning(L.togglePresetCannotDeleteDefault);
        return;
    }
    if (!confirm(L.togglePresetDeleteConfirm(current))) return;
    const presets = await getTogglePresetsForPreset(presetName);
    await updateTogglePresets(storage => { delete storage[presetName][current]; });
    setActiveTogglePresetName(presetName, 'default');
    saveFeatureSettings();
    await populateTogglePresetSelect(getActivePresetName());
    if (getActivePresetName() === presetName && presets['default']) {
        applyTogglePresetSnapshot(presets['default']);
    }
    toastr.success(L.togglePresetDeleted(current));
}

async function saveCurrentStateToTogglePreset() {
    const presetName = getActivePresetName();
    if (!presetName) return;
    const current = getActiveTogglePresetName(presetName);
    const snapshot = captureCurrentToggleState();
    await getTogglePresetsForPreset(presetName);
    await updateTogglePresets(storage => { storage[presetName][current] = snapshot; });
    toastr.success(L.togglePresetSaved(current === 'default' ? L.togglePresetDefault : current));
}

// ========== Toggle Preset UI ==========

let populateRequest = 0;
export function populateTogglePresetSelect(presetName) {
    return populateTogglePresetSelectAsync(presetName).catch(reportToggleStorageError);
}

async function populateTogglePresetSelectAsync(presetName) {
    const request = ++populateRequest;
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
    const presets = await getTogglePresetsForPreset(presetName);
    if (request !== populateRequest) return;
    select.innerHTML = '';
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

async function onTogglePresetSelectChange() {
    const select = document.getElementById('custom_preset_toggle_preset_select');
    if (!select) return;
    const presetName = getActivePresetName();
    if (!presetName) return;
    const toggleName = select.value;
    const presets = await getTogglePresetsForPreset(presetName);
    if (getActivePresetName() !== presetName) return;
    setActiveTogglePresetName(presetName, toggleName);
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

function handleToggleAction(action) {
    return async () => {
        const controls = [...document.querySelectorAll('#custom_preset_toggle_preset_section button, #custom_preset_toggle_preset_section select')];
        controls.forEach(control => { control.disabled = true; });
        try {
            await action();
        } catch (error) {
            reportToggleStorageError(error);
        } finally {
            controls.forEach(control => { control.disabled = false; });
        }
    };
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
    select.addEventListener('change', handleToggleAction(onTogglePresetSelectChange));

    const saveBtn = document.createElement('button');
    saveBtn.className = 'menu_button';
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
    saveBtn.title = L.togglePresetSave;
    saveBtn.addEventListener('click', handleToggleAction(saveCurrentStateToTogglePreset));

    const editBtn = document.createElement('button');
    editBtn.className = 'menu_button';
    editBtn.innerHTML = '<i class="fa-solid fa-pencil"></i>';
    editBtn.title = L.togglePresetRenameTitle;
    editBtn.addEventListener('click', handleToggleAction(renameTogglePreset));

    const addBtn = document.createElement('button');
    addBtn.className = 'menu_button';
    addBtn.innerHTML = '<i class="fa-solid fa-plus"></i>';
    addBtn.title = L.togglePresetNewTitle;
    addBtn.addEventListener('click', handleToggleAction(createTogglePreset));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'menu_button';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
    deleteBtn.addEventListener('click', handleToggleAction(deleteTogglePreset));

    row.appendChild(select);
    row.appendChild(saveBtn);
    row.appendChild(editBtn);
    row.appendChild(addBtn);
    row.appendChild(deleteBtn);

    section.appendChild(label);
    section.appendChild(row);
    return section;
}
