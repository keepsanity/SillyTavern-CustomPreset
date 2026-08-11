// 프롬프트 위치 지정.
// 프롬프트를 추가할 때 삽입 위치를 고르고, 편집창에서 위치를 바꾼다(저장 시 반영).
import { promptManager } from '../../../openai.js';
import { uuidv4 } from '../../../utils.js';
import { GLOBAL_PROMPT_CHARACTER_ID } from './constants.js';
import { getActivePromptManagerPreset, getOrderedPrompts } from './preset-utils.js';
import { getFeatureSettings } from './settings-store.js';
import { L } from './translations.js';

function isPromptPositionFeatureEnabled() {
    return getFeatureSettings().showPromptPositionFeature !== false;
}

export function loadPositionSelectForPrompt(promptId) {
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

/**
 * Add prompt to current prompt manager
 * @param {object} prompt - Prompt object to add
 */
export function addPromptToManager(prompt) {
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

// ========== Quick Toggle Group ==========

export function movePromptToPosition(promptId, afterIdentifier) {
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
