// 연결 프리셋: 채팅방마다 프리셋(+토글 프리셋)을 물려두고 입장 시 자동 적용한다.
import { chat_metadata } from '../../../../script.js';
import { saveMetadataDebounced } from '../../../extensions.js';
import { getActivePresetName, getPresetByName, getPresetNames } from './preset-utils.js';
import { getFeatureSettings } from './settings-store.js';
import { applyTogglePresetSnapshot, getTogglePresetsStorage, populateTogglePresetSelect, setActiveTogglePresetName } from './toggle-preset.js';
import { L } from './translations.js';

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

export function applyLinkedPresetForChat() {
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

export function createLinkedPresetMenuItem() {
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

// === Prompt Capture (채팅 → 프리셋 프롬프트 담기) ===
