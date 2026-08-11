// 채팅에서 프롬프트 담기.
// 코드블럭 옆 버튼이나 드래그 선택으로 채팅 본문을 프리셋 프롬프트에 담는다.
import { characters, name1, name2, saveSettingsDebounced, this_chid } from '../../../../script.js';
import { getGroupMembers, selected_group } from '../../../group-chats.js';
import { promptManager } from '../../../openai.js';
import { CAPTURE_MIN_NAME_LENGTH, EXTENSION_NAME } from './constants.js';
import { getActivePromptManagerPreset, getOrderedPrompts, getPresetByName } from './preset-utils.js';
import { renderPromptList } from './prompt-list.js';
import { addPromptToManager } from './prompt-position.js';
import { getFeatureSettings } from './settings-store.js';
import { escapeRegExp, saveActivePreset } from './shared.js';
import { L } from './translations.js';

let captureChatObserver = null;
let captureScanTimer = null;
let captureSelectionTimer = null;
let captureSelectionText = '';
let captureListenersBound = false;
// 담기 버튼을 화면 오른쪽 끝에서 얼마나 띄울지.
const CAPTURE_SELECTION_BUTTON_EDGE_GAP = 8;
// 메뉴를 닫을 때 바깥 클릭/ESC 감시도 같이 떼기 위해 정리 함수를 들고 있는다.
let captureMenuCleanup = null;

function isPromptCaptureEnabled() {
    return getFeatureSettings().showPromptCaptureFeature === true;
}

function isCaptureCodeBlockEnabled() {
    return isPromptCaptureEnabled() && getFeatureSettings().promptCaptureFromCodeBlock !== false;
}

function isCaptureSelectionEnabled() {
    return isPromptCaptureEnabled() && getFeatureSettings().promptCaptureFromSelection !== false;
}

/**
 * 현재 채팅 기준으로 "이름 → 매크로" 치환쌍을 만든다.
 * 긴 이름이 먼저 와야 "Anna"가 "Anna Kim"을 반쪽만 갉아먹지 않는다.
 * @returns {{name: string, macro: string}[]}
 */
function getCaptureNamePairs() {
    const pairs = [];

    const push = (rawName, macro) => {
        const name = (rawName || '').trim();
        if (name.length < CAPTURE_MIN_NAME_LENGTH) return;
        if (pairs.some(pair => pair.name === name)) return;
        pairs.push({ name, macro });
    };

    push(name1, '{{user}}');

    if (selected_group) {
        // 그룹챗은 멤버 전원을 {{char}}로 본다. 누가 말한 줄인지까지는 알 수 없다.
        for (const member of getGroupMembers(selected_group)) {
            push(member?.name, '{{char}}');
        }
    } else {
        push(name2, '{{char}}');
        push(characters?.[this_chid]?.name, '{{char}}');
    }

    pairs.sort((a, b) => b.name.length - a.name.length);
    return pairs;
}

/**
 * 본문의 유저/캐릭터 이름을 매크로로 바꾼다.
 * 한글에는 \b가 먹지 않으므로 앞뒤가 "영숫자/밑줄이 아닐 때"만 치환한다.
 * (한국어 조사는 이름에 바로 붙으므로 "린이" → "{{char}}이"가 되는 게 맞다)
 */
function applyCaptureMacros(text) {
    if (!text) return text;

    let result = text;
    for (const { name, macro } of getCaptureNamePairs()) {
        const pattern = new RegExp(`(^|[^A-Za-z0-9_{])${escapeRegExp(name)}(?![A-Za-z0-9_}])`, 'g');
        result = result.replace(pattern, (_match, prefix) => prefix + macro);
    }
    return result;
}

/**
 * 코드블럭 텍스트에서 버튼 아이콘을 뺀 순수 내용만 뽑는다.
 */
function getCodeBlockText(codeElement) {
    const clone = codeElement.cloneNode(true);
    clone.querySelectorAll('.code-copy, .custom_preset_code_capture').forEach(el => el.remove());
    return clone.textContent || '';
}

function removeCodeBlockCaptureButtons() {
    document.querySelectorAll('.custom_preset_code_capture').forEach(el => el.remove());
}

/**
 * 코어의 addCopyToCodeBlocks()가 넣어준 복사 버튼 옆에 담기 버튼을 추가한다.
 */
export function ensureCodeBlockCaptureButtons() {
    const chatElement = document.getElementById('chat');
    if (!chatElement) return;

    if (!isCaptureCodeBlockEnabled()) {
        removeCodeBlockCaptureButtons();
        return;
    }

    chatElement.querySelectorAll('.mes_text pre code, .mes_reasoning pre code').forEach(codeElement => {
        if (codeElement.querySelector(':scope > .custom_preset_code_capture')) return;

        const button = document.createElement('i');
        button.className = 'fa-solid fa-file-import custom_preset_code_capture interactable';
        button.title = L.captureButtonTitle;
        // 코드블럭 클릭이 메시지 편집 등으로 새지 않게 막는다.
        button.addEventListener('click', (e) => e.stopPropagation());
        button.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            const rect = button.getBoundingClientRect();
            showCaptureMenu(rect.left, rect.bottom + 6, getCodeBlockText(codeElement));
        });

        codeElement.appendChild(button);
    });
}

function observeChatForCapture() {
    const chatElement = document.getElementById('chat');
    if (!chatElement || captureChatObserver) return;

    // 우리가 버튼을 붙이는 것도 mutation이라 다시 불리지만,
    // 이미 붙은 블럭은 건너뛰므로 한 바퀴 더 돌고 조용해진다.
    captureChatObserver = new MutationObserver(() => {
        clearTimeout(captureScanTimer);
        captureScanTimer = setTimeout(ensureCodeBlockCaptureButtons, 150);
    });
    captureChatObserver.observe(chatElement, { childList: true, subtree: true });
}

function getSelectionCaptureButton() {
    let button = document.getElementById('custom_preset_capture_selection_btn');
    if (button) return button;

    button = document.createElement('div');
    button.id = 'custom_preset_capture_selection_btn';
    button.className = 'custom_preset_capture_selection_btn';
    button.title = L.captureButtonTitle;
    button.innerHTML = '<i class="fa-solid fa-file-import"></i>';
    button.style.display = 'none';

    const trigger = () => {
        const text = captureSelectionText;
        const rect = button.getBoundingClientRect();
        hideSelectionCaptureButton();
        if (text) showCaptureMenu(rect.left, rect.bottom + 6, text);
    };

    button.addEventListener('click', trigger);
    // touchend에서 preventDefault를 해야 뒤따르는 합성 click이 안 생겨 두 번 열리지 않는다.
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        trigger();
    });
    // 버튼을 누르는 순간 선택이 풀리지 않도록.
    button.addEventListener('mousedown', (e) => e.preventDefault());

    // ST가 body 안에서 이것저것 옮기므로 최상위에 붙여 둔다.
    document.documentElement.appendChild(button);
    return button;
}

export function hideSelectionCaptureButton() {
    const button = document.getElementById('custom_preset_capture_selection_btn');
    if (button) button.style.display = 'none';
}

/**
 * 드래그 선택을 푼다.
 * 선택이 살아 있으면 OS의 복사·붙여넣기 메뉴와 선택 핸들이 계속 떠서 담기 창을 가린다.
 * 담을 텍스트는 이미 따로 들고 있으므로 풀어도 잃는 게 없다.
 */
function clearTextSelection() {
    try {
        const selection = window.getSelection();
        if (!selection) return;
        if (typeof selection.removeAllRanges === 'function') selection.removeAllRanges();
        else selection.empty?.();
    } catch (err) {
        // 일부 브라우저가 던지는 경우가 있는데, 못 풀어도 기능 자체는 굴러간다.
        console.debug(`[${EXTENSION_NAME}] Could not clear selection:`, err);
    }
}

function getMessageElement(node) {
    if (!node) return null;
    const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return element ? element.closest('.mes') : null;
}

/**
 * 채팅 메시지 본문 안에서만 담기 버튼을 띄운다.
 */
function updateSelectionCaptureButton() {
    if (!isCaptureSelectionEnabled()) {
        hideSelectionCaptureButton();
        return;
    }
    // 담기 메뉴/창이 떠 있는 동안은 건드리지 않는다.
    if (document.getElementById('custom_preset_capture_menu')) return;

    const selection = window.getSelection();
    const text = selection?.toString().trim() || '';
    if (!selection || selection.rangeCount === 0 || !text) {
        hideSelectionCaptureButton();
        return;
    }

    const anchorMes = getMessageElement(selection.anchorNode);
    const focusMes = getMessageElement(selection.focusNode);
    if (!anchorMes || anchorMes !== focusMes) {
        hideSelectionCaptureButton();
        return;
    }

    const messageBody = anchorMes.querySelector('.mes_text');
    if (!messageBody || !messageBody.contains(selection.anchorNode)) {
        hideSelectionCaptureButton();
        return;
    }

    captureSelectionText = text;

    const button = getSelectionCaptureButton();
    button.style.display = 'flex';

    const width = button.offsetWidth || 34;
    const height = button.offsetHeight || 34;

    // 가로: 선택 영역과 무관하게 화면 오른쪽 끝에 붙인다.
    // 네이티브 선택 메뉴는 선택 영역의 가로 중앙에 뜨고, 다른 확장 버튼들은 선택 끝을 따라다닌다.
    // 오른쪽 끝은 둘 다 오지 않는 자리다.
    const left = Math.max(8, window.innerWidth - width - CAPTURE_SELECTION_BUTTON_EDGE_GAP);

    // 세로: 선택이 "시작되는" 줄에 맞춘다.
    // 다른 확장들은 선택이 끝나는 줄 아래에 버튼을 두므로, 시작 줄에 두면 세로로도 갈라진다.
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const anchor = rects.length ? rects[0] : range.getBoundingClientRect();
    const top = Math.max(8, Math.min(anchor.top, window.innerHeight - height - 8));

    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
}

function bindCaptureSelectionListeners() {
    if (captureListenersBound) return;
    captureListenersBound = true;

    const scheduleUpdate = (delay) => {
        clearTimeout(captureSelectionTimer);
        captureSelectionTimer = setTimeout(updateSelectionCaptureButton, delay);
    };

    document.addEventListener('mouseup', (e) => {
        if (e.target?.closest?.('#custom_preset_capture_selection_btn, #custom_preset_capture_menu')) return;
        scheduleUpdate(60);
    });
    // 모바일은 네이티브 선택 핸들이 자리를 잡을 시간이 필요하다.
    document.addEventListener('touchend', (e) => {
        if (e.target?.closest?.('#custom_preset_capture_selection_btn, #custom_preset_capture_menu')) return;
        scheduleUpdate(350);
    });
    document.addEventListener('selectionchange', () => {
        const text = window.getSelection()?.toString().trim() || '';
        if (!text) {
            hideSelectionCaptureButton();
            return;
        }
        scheduleUpdate(200);
    });
    // 스크롤하면 선택 영역이 움직이므로 위치를 다시 잡는다.
    document.getElementById('chat')?.addEventListener('scroll', () => scheduleUpdate(120), { passive: true });
}

export function hideCaptureMenu() {
    document.getElementById('custom_preset_capture_menu')?.remove();
    if (captureMenuCleanup) {
        captureMenuCleanup();
        captureMenuCleanup = null;
    }
}

/**
 * 담기 메뉴 (기존에 추가 / 기존 대체 / 새로 추가)
 * @param {number} x 화면 기준 좌표
 * @param {number} y 화면 기준 좌표
 * @param {string} rawText 담을 원본 텍스트
 */
function showCaptureMenu(x, y, rawText) {
    hideCaptureMenu();
    hideSelectionCaptureButton();

    const text = (rawText || '').trim();
    if (!text) {
        toastr.warning(L.captureNoContent);
        return;
    }

    // 담을 내용은 위에서 이미 확보했으니, 화면을 가리는 선택은 여기서 푼다.
    clearTextSelection();

    const menu = document.createElement('div');
    menu.id = 'custom_preset_capture_menu';
    menu.className = 'custom_preset_capture_menu';

    const items = [
        { label: L.captureMenuAppend, icon: 'fa-plus', mode: 'append' },
        { label: L.captureMenuReplace, icon: 'fa-right-left', mode: 'replace' },
        { label: L.captureMenuNew, icon: 'fa-file-circle-plus', mode: 'new' },
    ];

    for (const item of items) {
        const entry = document.createElement('div');
        entry.className = 'custom_preset_capture_menu_item interactable';

        const icon = document.createElement('i');
        icon.className = `fa-solid ${item.icon}`;
        const label = document.createElement('span');
        label.textContent = item.label;

        entry.appendChild(icon);
        entry.appendChild(label);
        entry.addEventListener('click', (e) => {
            e.stopPropagation();
            hideCaptureMenu();
            showCaptureModal(item.mode, text);
        });

        menu.appendChild(entry);
    }

    menu.addEventListener('pointerup', (e) => e.stopPropagation());
    document.body.appendChild(menu);

    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    // 아래로 넘칠 때만 위로 뒤집는다.
    const top = y + height > window.innerHeight - 8
        ? Math.max(8, y - height - 12)
        : y;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const onOutside = (e) => {
        if (e.target?.closest?.('#custom_preset_capture_menu')) return;
        hideCaptureMenu();
    };
    const onKey = (e) => {
        if (e.key === 'Escape') hideCaptureMenu();
    };

    // 메뉴를 띄운 그 클릭에 바로 닫히지 않게 다음 틱부터 감시한다.
    setTimeout(() => {
        // 이 사이에 이미 닫혔으면 리스너를 달지 않는다.
        if (!document.getElementById('custom_preset_capture_menu')) return;
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onKey, true);
        captureMenuCleanup = () => {
            document.removeEventListener('pointerdown', onOutside, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, 0);
}

/**
 * 커서 위치에 텍스트를 그대로 끼워넣는다.
 * 커서를 놓은 딱 그 자리에 들어가야 하므로 앞뒤 개행을 임의로 붙이지 않는다.
 * 줄바꿈이 필요하면 담을 내용 칸에서 직접 넣으면 된다.
 * @param {string} existing 기존 내용
 * @param {string} insert 끼워넣을 내용
 * @param {number} caret 커서 오프셋
 */
function spliceAtCaret(existing, insert, caret) {
    const position = Math.max(0, Math.min(caret ?? existing.length, existing.length));
    return existing.slice(0, position) + insert + existing.slice(position);
}

function refreshCustomizerList() {
    const presetSelect = document.getElementById('custom_preset_select');
    if (!presetSelect) return;
    renderPromptList(getPresetByName(presetSelect.value));
}

/**
 * 프롬프트 내용 변경을 저장한다. (compare 모달과 동일한 경로)
 */
function persistPromptContentChange() {
    saveSettingsDebounced();
    if (getFeatureSettings().autoSavePreset) {
        saveActivePreset();
    }
    refreshCustomizerList();
}

/**
 * 담기 창.
 * @param {'append'|'replace'|'new'} mode
 * @param {string} rawText 원본(치환 전) 텍스트
 */
function showCaptureModal(mode, rawText) {
    if (!promptManager) {
        toastr.error(L.promptManagerNotInit);
        return;
    }

    const preset = getActivePromptManagerPreset();
    const targetPrompts = getOrderedPrompts(preset)
        .filter(({ prompt }) => prompt && prompt.name && !prompt.marker);

    if (mode !== 'new' && targetPrompts.length === 0) {
        toastr.warning(L.captureNoPrompts);
        return;
    }

    const settings = getFeatureSettings();

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal custom_preset_capture_modal';

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const title = document.createElement('h3');
    title.textContent = mode === 'append' ? L.captureTitleAppend
        : mode === 'replace' ? L.captureTitleReplace
            : L.captureTitleNew;
    title.style.marginBottom = '12px';

    // --- 매크로 변환 ---
    const macroRow = document.createElement('label');
    macroRow.className = 'checkbox_label';
    const macroCheckbox = document.createElement('input');
    macroCheckbox.type = 'checkbox';
    macroCheckbox.checked = settings.promptCaptureMacroDefault !== false;
    const macroText = document.createElement('span');
    macroText.textContent = L.captureUseMacro;
    macroRow.appendChild(macroCheckbox);
    macroRow.appendChild(macroText);

    const macroNote = document.createElement('small');
    macroNote.className = 'notes';
    macroNote.textContent = L.captureUseMacroNote;
    macroNote.style.display = 'block';
    macroNote.style.marginBottom = '10px';

    // --- 내용 ---
    const contentLabel = document.createElement('label');
    contentLabel.textContent = L.captureContentLabel;
    contentLabel.style.fontWeight = '600';
    contentLabel.style.display = 'block';
    contentLabel.style.marginBottom = '4px';

    const contentArea = document.createElement('textarea');
    contentArea.className = 'text_pole custom_preset_compare_textarea';

    const renderContent = () => {
        contentArea.value = macroCheckbox.checked ? applyCaptureMacros(rawText) : rawText;
    };
    renderContent();

    if (macroCheckbox.checked && getCaptureNamePairs().length === 0) {
        macroNote.textContent = L.captureMacroNoNames;
    }

    macroCheckbox.addEventListener('change', renderContent);

    // --- 모드별 컨트롤 ---
    const optionsBlock = document.createElement('div');
    optionsBlock.style.marginTop = '12px';

    let targetSelect = null;
    let nameInput = null;
    let roleSelect = null;
    let appendTopRadio = null;
    let appendCaretRadio = null;
    let existingArea = null;
    let appendCaret = 0;

    if (mode === 'new') {
        const nameLabel = document.createElement('label');
        nameLabel.textContent = L.captureNameLabel;
        nameLabel.style.fontWeight = '600';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '4px';

        nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'text_pole';
        nameInput.style.width = '100%';
        nameInput.placeholder = L.captureNamePlaceholder;

        const roleLabel = document.createElement('label');
        roleLabel.textContent = L.captureRoleLabel;
        roleLabel.style.fontWeight = '600';
        roleLabel.style.display = 'block';
        roleLabel.style.margin = '10px 0 4px';

        roleSelect = document.createElement('select');
        roleSelect.className = 'text_pole';
        roleSelect.style.width = '100%';
        for (const role of ['system', 'user', 'assistant']) {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            roleSelect.appendChild(option);
        }

        optionsBlock.appendChild(nameLabel);
        optionsBlock.appendChild(nameInput);
        optionsBlock.appendChild(roleLabel);
        optionsBlock.appendChild(roleSelect);
    } else {
        const targetLabel = document.createElement('label');
        targetLabel.textContent = L.captureTargetLabel;
        targetLabel.style.fontWeight = '600';
        targetLabel.style.display = 'block';
        targetLabel.style.marginBottom = '4px';

        targetSelect = document.createElement('select');
        targetSelect.className = 'text_pole';
        targetSelect.style.width = '100%';

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = L.captureTargetPlaceholder;
        placeholder.disabled = true;
        placeholder.selected = true;
        targetSelect.appendChild(placeholder);

        for (const { prompt } of targetPrompts) {
            const option = document.createElement('option');
            option.value = prompt.identifier;
            option.textContent = prompt.name;
            targetSelect.appendChild(option);
        }

        optionsBlock.appendChild(targetLabel);
        optionsBlock.appendChild(targetSelect);

        if (mode === 'append') {
            const whereLabel = document.createElement('label');
            whereLabel.textContent = L.captureAppendWhere;
            whereLabel.style.fontWeight = '600';
            whereLabel.style.display = 'block';
            whereLabel.style.margin = '10px 0 4px';

            const whereRow = document.createElement('div');
            whereRow.style.display = 'flex';
            whereRow.style.gap = '14px';
            whereRow.style.flexWrap = 'wrap';

            const makeRadio = (labelText, checked) => {
                const wrapper = document.createElement('label');
                wrapper.className = 'checkbox_label';
                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'custom_preset_capture_where';
                radio.checked = checked;
                const span = document.createElement('span');
                span.textContent = labelText;
                wrapper.appendChild(radio);
                wrapper.appendChild(span);
                whereRow.appendChild(wrapper);
                return radio;
            };

            const appendBottomRadio = makeRadio(L.captureAppendBottom, true);
            appendTopRadio = makeRadio(L.captureAppendTop, false);
            appendCaretRadio = makeRadio(L.captureAppendCaret, false);

            const existingLabel = document.createElement('label');
            existingLabel.textContent = L.captureExistingLabel;
            existingLabel.style.fontWeight = '600';
            existingLabel.style.display = 'block';
            existingLabel.style.margin = '10px 0 4px';

            existingArea = document.createElement('textarea');
            existingArea.className = 'text_pole custom_preset_capture_existing';
            existingArea.placeholder = L.captureExistingEmpty;
            existingArea.disabled = true;

            const existingHint = document.createElement('small');
            existingHint.className = 'notes';
            existingHint.textContent = L.captureExistingHint;
            existingHint.style.display = 'block';

            const caretHint = document.createElement('small');
            caretHint.className = 'notes';
            caretHint.style.display = 'none';

            const updateCaretHint = () => {
                if (!appendCaretRadio.checked || existingArea.disabled) {
                    caretHint.style.display = 'none';
                    return;
                }
                appendCaret = existingArea.selectionStart ?? 0;
                const line = existingArea.value.slice(0, appendCaret).split('\n').length;
                const total = existingArea.value.split('\n').length;
                caretHint.textContent = L.captureCaretAt(line, total);
                caretHint.style.display = 'block';
            };

            // 커서가 움직일 만한 상황을 모두 훑어 위치 표시를 갱신한다.
            for (const evt of ['click', 'keyup', 'input', 'focus', 'select']) {
                existingArea.addEventListener(evt, updateCaretHint);
            }
            for (const radio of [appendBottomRadio, appendTopRadio, appendCaretRadio]) {
                radio.addEventListener('change', updateCaretHint);
            }

            targetSelect.addEventListener('change', () => {
                const picked = targetPrompts.find(({ prompt }) => prompt.identifier === targetSelect.value);
                existingArea.disabled = !picked;
                existingArea.value = picked?.prompt.content || '';
                appendCaret = existingArea.value.length;
                updateCaretHint();
            });

            optionsBlock.appendChild(whereLabel);
            optionsBlock.appendChild(whereRow);
            optionsBlock.appendChild(existingLabel);
            optionsBlock.appendChild(existingArea);
            optionsBlock.appendChild(existingHint);
            optionsBlock.appendChild(caretHint);
        }
    }

    // --- 버튼 ---
    const buttonRow = document.createElement('div');
    buttonRow.style.display = 'flex';
    buttonRow.style.gap = '8px';
    buttonRow.style.justifyContent = 'flex-end';
    buttonRow.style.marginTop = '14px';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'menu_button';
    cancelButton.textContent = L.cancel;
    cancelButton.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    const confirmButton = document.createElement('button');
    confirmButton.type = 'button';
    confirmButton.className = 'menu_button';
    confirmButton.textContent = L.confirm;
    confirmButton.addEventListener('click', (e) => {
        e.stopPropagation();

        const content = contentArea.value.trim();
        if (!content) {
            toastr.warning(L.captureNoContent);
            return;
        }

        if (mode === 'new') {
            const promptName = nameInput.value.trim();
            if (!promptName) {
                toastr.warning(L.captureNoName);
                return;
            }
            removeModal();
            addPromptToManager({
                name: promptName,
                role: roleSelect.value,
                content,
            });
            return;
        }

        const found = targetPrompts.find(({ prompt }) => prompt.identifier === targetSelect.value);
        if (!found) {
            toastr.warning(L.captureNoTarget);
            return;
        }

        const target = found.prompt;
        if (mode === 'replace') {
            target.content = content;
            persistPromptContentChange();
            toastr.success(L.captureReplaced(target.name));
        } else {
            // 기존 내용 칸에서 직접 고쳤을 수도 있으므로 그 값을 기준으로 삼는다.
            const existing = existingArea ? existingArea.value : (target.content || '');

            if (appendCaretRadio?.checked) {
                target.content = spliceAtCaret(existing, content, appendCaret);
            } else if (appendTopRadio?.checked) {
                target.content = existing ? `${content}\n\n${existing}` : content;
            } else {
                target.content = existing ? `${existing}\n\n${content}` : content;
            }

            persistPromptContentChange();
            toastr.success(L.captureAppended(target.name));
        }

        removeModal();
    });

    buttonRow.appendChild(cancelButton);
    buttonRow.appendChild(confirmButton);

    modal.appendChild(title);
    modal.appendChild(macroRow);
    modal.appendChild(macroNote);
    modal.appendChild(contentLabel);
    modal.appendChild(contentArea);
    modal.appendChild(optionsBlock);
    modal.appendChild(buttonRow);

    const stopAll = (e) => e.stopPropagation();
    for (const evt of ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
        modal.addEventListener(evt, stopAll);
        overlay.addEventListener(evt, stopAll);
    }
    overlay.addEventListener('click', () => removeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
        modal.style.top = `${Math.max(10, (window.innerHeight - modal.offsetHeight) / 2)}px`;
        modal.style.left = `${Math.max(10, (window.innerWidth - modal.offsetWidth) / 2)}px`;
    });
}

export function applyCaptureFeatureState() {
    if (!isPromptCaptureEnabled()) {
        removeCodeBlockCaptureButtons();
        hideSelectionCaptureButton();
        hideCaptureMenu();
        return;
    }
    bindCaptureSelectionListeners();
    observeChatForCapture();
    ensureCodeBlockCaptureButtons();
}
