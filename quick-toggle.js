// 빠른 프롬프트 토글 + 토글 그룹.
// 입력창 위에 버튼을 띄워 프롬프트를 바로 켜고 끈다.
// 그룹 설정은 프리셋 안에 저장되므로 프리셋을 공유하면 같이 따라간다.
import { promptManager } from '../../../openai.js';
import { GLOBAL_PROMPT_CHARACTER_ID, QUICK_TOGGLE_ENABLED_KEY, QUICK_TOGGLE_GROUP_SEPARATOR, QUICK_TOGGLE_NAME_KEY, QUICK_TOGGLE_SET_SEPARATOR } from './constants.js';
import { getActivePromptManagerPreset, getOrderedPrompts } from './preset-utils.js';
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { matchesSearch, saveActivePreset } from './shared.js';
import { L } from './translations.js';

let quickToggleButtonListenerAttached = false;

export function isQuickToggleFeatureEnabled() {
    return getFeatureSettings().showQuickPromptToggleFeature !== false;
}

function isQuickToggleCollapseFeatureEnabled() {
    return getFeatureSettings().showQuickPromptToggleCollapseFeature !== false;
}

export function isQuickToggleGroupFeatureEnabled() {
    return isQuickToggleFeatureEnabled() && getFeatureSettings().showQuickToggleGroupFeature === true;
}

function isQuickToggleBarCollapsed() {
    return getFeatureSettings().quickPromptToggleBarCollapsed === true;
}

function setQuickToggleBarCollapsed(collapsed) {
    const settings = getFeatureSettings();
    settings.quickPromptToggleBarCollapsed = !!collapsed;
    saveFeatureSettings();
}

export function ensureQuickTogglePopupControls() {
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

export function readQuickToggleForm() {
    const nameInput = document.getElementById('custom_preset_quick_toggle_name');
    const enabledInput = document.getElementById('custom_preset_quick_toggle_enabled');
    return {
        name: (nameInput?.value || '').trim(),
        enabled: !!enabledInput?.checked,
    };
}

export function applyQuickToggleDataToPrompt(promptId, quickData) {
    const prompt = promptManager?.getPromptById?.(promptId);
    if (!prompt) return;
    // 쉼표 다중 입력을 정규화해서 저장한다. ("약 ,중,,강" → "약, 중, 강")
    prompt[QUICK_TOGGLE_NAME_KEY] = formatQuickToggleNames(parseQuickToggleNames(quickData.name));
    prompt[QUICK_TOGGLE_ENABLED_KEY] = !!quickData.enabled;
    promptManager.saveServiceSettings?.();
    renderQuickToggleButtons();
}

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
 * 그룹 이름을 태그와 표시용 이름으로 나눈다.
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
    // 어느 한쪽이 비면 태그로 보지 않고 이름 그대로 쓴다.
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
 * @param {boolean} ignoreSameSet - 같은 태그끼리 전환하는 중이면 같은 태그 그룹은 보호하지 않는다 (끄는 게 목적이므로)
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
 * @param {object[]} allGroups - 공유 프롬프트/태그 처리를 위한 전체 그룹 목록
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
            // 같은 태그를 가진 다른 그룹은 끈다.
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
 * 그룹 이름/태그 이름에 쓸 수 없는 문자 검사.
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

    // 다른 모달과 같은 방식으로 JS가 위치를 잡는다.
    // (CSS로 중앙정렬하면 상위 요소의 transform 때문에 기준이 어긋난다)
    let lastViewWidth = -1;
    const positionModal = () => {
        modal.style.top = Math.max(10, (window.innerHeight - modal.offsetHeight) / 2) + 'px';

        // 키보드가 올라올 때는 세로만 바뀐다. 가로까지 다시 계산하면 모달이 좌우로 흔들린다.
        const viewWidth = window.innerWidth;
        if (viewWidth === lastViewWidth) return;
        lastViewWidth = viewWidth;
        modal.style.left = Math.max(10, (viewWidth - modal.offsetWidth) / 2) + 'px';
    };

    const removeModal = () => {
        window.removeEventListener('resize', positionModal);
        window.visualViewport?.removeEventListener('resize', positionModal);
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
    setBtn.innerHTML = '<i class="fa-solid fa-tag"></i>';
    setBtn.title = L.toggleGroupSetTitle;
    setBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!selectedGroup) return;
        const { setName, label } = parseGroupKey(selectedGroup);

        const answer = prompt(L.toggleGroupSetPrompt, setName);
        if (answer === null) return;

        // 빈 값으로 두면 태그를 떼어낸다.
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

    requestAnimationFrame(positionModal);
    // 모바일에서 검색창을 누르면 키보드가 올라와 화면 높이가 바뀐다. 그때 다시 잡아준다.
    window.addEventListener('resize', positionModal);
    window.visualViewport?.addEventListener('resize', positionModal);
}

export function createQuickToggleGroupUI() {
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

export function ensureQuickToggleCollapseButton() {
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

export function renderQuickToggleButtons() {
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
        // 태그가 붙어 있으면 태그는 빼고 표시한다. ("강도::약" → "약")
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
