// 프롬프트 키워드 트리거.
//
// Triggers 셀렉트에 "키워드" 옵션을 얹고, 고른 프롬프트는 최근 대화에 키워드가
// 있을 때만 프롬프트에 들어가게 한다. 판정은 PromptManager.shouldTrigger를 감싸서
// 하고, 생성타입 필터(Normal/Continue/...)는 ST 원본 로직을 그대로 쓴다.
// 즉 키워드는 기존 필터를 대체하지 않고 AND로 얹히는 조건이다.
//
// 레이어: 기능 모듈. 최하위(constants/translations/settings-store)만 import한다.
import { promptManager } from '../../../openai.js';
import { chat } from '../../../../script.js';
import { splitKeywordsAndRegexes, parseRegexFromString } from '../../../world-info.js';
import { L } from './translations.js';
import { EXTENSION_NAME, KEYWORD_TRIGGER_KEY, KEYWORD_TRIGGER_OPTION, KEYWORD_TRIGGER_DEFAULT_DEPTH, KEYWORD_TRIGGER_MAX_DEPTH } from './constants.js';
import { getFeatureSettings } from './settings-store.js';

export function isKeywordTriggerFeatureEnabled() {
    return getFeatureSettings().showKeywordTriggerFeature === true;
}

export function getGlobalKeywordScanDepth() {
    const depth = Number(getFeatureSettings().keywordTriggerScanDepth);
    if (!Number.isFinite(depth) || depth < 1) return KEYWORD_TRIGGER_DEFAULT_DEPTH;
    return Math.min(Math.floor(depth), KEYWORD_TRIGGER_MAX_DEPTH);
}

/* ── 키워드 트리거 ─────────────────────────────────────────────────────────
 * Triggers 셀렉트에 "키워드" 옵션을 하나 얹고, 고른 프롬프트는 최근 대화에
 * 키워드가 있을 때만 들어가게 한다. 실제 판정은 PromptManager.shouldTrigger를
 * 감싸서 하고, 생성타입 필터(Normal/Continue/...)는 ST 원본 로직을 그대로 쓴다.
 * 즉 키워드는 기존 필터를 대체하지 않고 AND로 얹히는 조건이다.
 */

// 편집창에 떠 있는 프롬프트의 작업본. 프롬프트를 저장할 때 실제 프롬프트에 반영된다.
let keywordTriggerDraft = { promptId: null, isMarker: false, config: normalizeKeywordTriggerConfig(null) };
let shouldTriggerPatched = false;

function normalizeKeywordTriggerConfig(raw) {
    const cfg = (raw && typeof raw === 'object') ? raw : {};

    // 앞뒤 쉼표까지 털어낸다. ST의 쉼표 토크나이저는 ",,"처럼 붙여 쓰면 ", 도서관" 같은
    // 토큰을 흘리는데(로어북도 동일), 그대로 두면 절대 안 걸리는 키워드가 조용히 남는다.
    let keywords = Array.isArray(cfg.keywords)
        ? cfg.keywords.map(keyword => String(keyword ?? '').replace(/^[\s,]+|[\s,]+$/g, '')).filter(Boolean)
        : [];

    // 예전에는 "정규식으로 해석" 체크박스 하나로 목록 전체를 정규식 취급했다.
    // 지금은 로어북과 같게 /패턴/ 형태만 정규식이므로, 옛 설정은 한 번 감싸서 옮긴다.
    // (저장은 새 모양으로만 되므로 이 변환은 프롬프트당 한 번만 일어난다.)
    if (cfg.regex === true) {
        keywords = keywords.map(keyword => parseRegexFromString(keyword)
            ? keyword
            : `/${keyword.replace(/\//g, '\\/')}/`);
    }

    // null이면 확장 설정의 전역 깊이를 따른다.
    let scanDepth = null;
    if (cfg.scanDepth !== null && cfg.scanDepth !== undefined && cfg.scanDepth !== '') {
        const parsed = Number(cfg.scanDepth);
        if (Number.isFinite(parsed) && parsed >= 1) {
            scanDepth = Math.min(Math.floor(parsed), KEYWORD_TRIGGER_MAX_DEPTH);
        }
    }

    return {
        enabled: cfg.enabled === true,
        keywords,
        matchAll: cfg.matchAll === true,
        caseSensitive: cfg.caseSensitive === true,
        scanTarget: ['all', 'user', 'assistant'].includes(cfg.scanTarget) ? cfg.scanTarget : 'all',
        scanDepth,
    };
}

function getKeywordTriggerConfig(prompt) {
    return normalizeKeywordTriggerConfig(prompt?.[KEYWORD_TRIGGER_KEY]);
}

/**
 * Triggers 셀렉트는 데스크톱에서만 select2가 붙는다. (openai.js의 `if (!isMobile())`)
 * select2가 붙으면 밑단 <select>는 숨겨지고, option.selected를 코드로 바꿔도
 * 화면에는 반영되지 않는다. 이 네임스페이스 이벤트가 select2에게 다시 그리라고 알린다.
 * 'change.select2'는 select2 내부용이라 우리 change 핸들러는 다시 돌지 않는다.
 * @param {HTMLSelectElement} triggerField
 */
function syncTriggerFieldUi(triggerField) {
    if (typeof jQuery !== 'function') return;
    const field = jQuery(triggerField);
    if (field.data('select2')) field.trigger('change.select2');
}

function getKeywordTriggerField() {
    return document.getElementById('completion_prompt_manager_popup_entry_form_injection_trigger');
}

function isKeywordTriggerSelected() {
    const triggerField = getKeywordTriggerField();
    if (!triggerField) return false;
    return Array.from(triggerField.selectedOptions).some(option => option.value === KEYWORD_TRIGGER_OPTION);
}

export function ensureKeywordTriggerControls() {
    const triggerField = getKeywordTriggerField();
    if (!triggerField) return;

    // 기능을 끄면 옵션 자체를 빼서 새로 고를 수 없게 한다.
    // 이미 설정된 프롬프트는 shouldTrigger 쪽에서 조건을 무시하고 평소처럼 발동한다.
    const existing = triggerField.querySelector('option[data-custom-preset-keyword]');
    if (isKeywordTriggerFeatureEnabled()) {
        if (!existing) {
            const option = document.createElement('option');
            option.value = KEYWORD_TRIGGER_OPTION;
            option.textContent = L.keywordTriggerOption;
            option.dataset.customPresetKeyword = '1';
            triggerField.appendChild(option);
            syncTriggerFieldUi(triggerField);
        }
    } else if (existing) {
        existing.remove();
        syncTriggerFieldUi(triggerField);
    }

    if (!triggerField.dataset.customPresetKeywordBound) {
        // select2는 change를 jQuery 이벤트로 쏜다. jQuery의 trigger()는 네이티브
        // addEventListener 핸들러를 부르지 않으므로(<select>에 네이티브 .change()가 없다)
        // 반드시 jQuery로 바인딩해야 데스크톱에서도 선택이 잡힌다.
        // jQuery 핸들러는 네이티브 dispatchEvent도 같이 받으므로 모바일에서도 그대로 동작한다.
        jQuery(triggerField).on('change', () => updateKeywordTriggerSummary());
        triggerField.dataset.customPresetKeywordBound = '1';
    }

    if (document.getElementById('custom_preset_keyword_trigger_block')) return;

    // 편집창 폼은 세로 flex이고 프롬프트 텍스트에리어가 flex:1로 남는 높이를 다 먹는다.
    // (promptmanager.css의 .completion_prompt_manager_popup_entry_form_control:has(#..._form_prompt))
    // 즉 행을 하나 추가하면 그만큼 텍스트에리어가 그대로 줄어든다.
    // 그래서 새 행을 만들지 않고 Triggers 칸 안, 이미 있는 안내문 자리에 한 줄로 끼워넣는다.
    const triggerControl = triggerField.parentElement;
    if (!triggerControl) return;

    const block = document.createElement('div');
    block.id = 'custom_preset_keyword_trigger_block';
    block.className = 'custom_preset_keyword_trigger_block';
    block.style.display = 'none';

    const editLink = document.createElement('a');
    editLink.id = 'custom_preset_keyword_trigger_edit';
    editLink.className = 'custom_preset_keyword_trigger_link';
    editLink.title = L.keywordTriggerEdit;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-gear';

    const summary = document.createElement('span');
    summary.id = 'custom_preset_keyword_trigger_summary';

    editLink.appendChild(icon);
    editLink.appendChild(summary);
    editLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showKeywordTriggerModal();
    });

    // 마커일 때만 나오는 경고. 평소에는 아예 렌더링하지 않아 높이를 안 먹는다.
    const warn = document.createElement('small');
    warn.id = 'custom_preset_keyword_trigger_warn';
    warn.className = 'custom_preset_keyword_trigger_warn';
    warn.textContent = L.keywordTriggerMarkerWarn;
    warn.style.display = 'none';

    block.appendChild(editLink);
    block.appendChild(warn);

    triggerControl.appendChild(block);
}

export function updateKeywordTriggerSummary() {
    const block = document.getElementById('custom_preset_keyword_trigger_block');
    if (!block) return;

    // Triggers에서 "키워드"를 고른 프롬프트에서만 보인다.
    const visible = isKeywordTriggerFeatureEnabled() && isKeywordTriggerSelected();
    block.style.display = visible ? '' : 'none';

    // 우리 줄이 보이는 동안에는 ST의 "Filter to specific generation types." 안내를 대신한다.
    // 자리를 새로 만들지 않고 넘겨받는 것이라 텍스트에리어 높이가 그대로 유지된다.
    const stHint = block.parentElement?.querySelector('.text_muted');
    if (stHint) stHint.style.display = visible ? 'none' : '';

    if (!visible) return;

    const config = keywordTriggerDraft.config;

    const summary = document.getElementById('custom_preset_keyword_trigger_summary');
    if (summary) {
        summary.textContent = config.keywords.length
            ? L.keywordTriggerSummary(config.keywords.length)
            : L.keywordTriggerNone;
    }

    // 키워드가 0개면 조건 없이 항상 발동한다. 설정하다 만 상태로 착각하기 쉬우니 눈에 띄게 한다.
    document.getElementById('custom_preset_keyword_trigger_edit')
        ?.classList.toggle('custom_preset_keyword_trigger_empty', config.keywords.length === 0);

    // 마커는 자기 내용이 없고 조립할 때 채워지는 자리표시자라, 키워드가 안 걸리면
    // 그 자리에 들어갈 내용(로어북, 캐릭터 설정 등)이 통째로 빠진다.
    const warn = document.getElementById('custom_preset_keyword_trigger_warn');
    if (warn) warn.style.display = keywordTriggerDraft.isMarker ? '' : 'none';
}

export function loadKeywordTriggerFormForPrompt(promptId) {
    ensureKeywordTriggerControls();

    const prompt = promptId ? promptManager?.getPromptById?.(promptId) : null;
    keywordTriggerDraft = {
        promptId: promptId || null,
        isMarker: prompt?.marker === true,
        config: getKeywordTriggerConfig(prompt),
    };

    // PromptManager는 injection_trigger에 없는 값을 무조건 해제하므로,
    // 저장해 둔 설정을 보고 "키워드" 옵션만 다시 선택 상태로 되돌린다.
    const triggerField = getKeywordTriggerField();
    const option = triggerField?.querySelector('option[data-custom-preset-keyword]');
    if (option) {
        option.selected = keywordTriggerDraft.config.enabled;
        // select2는 밑단 <select>를 직접 고쳐도 모르므로 따로 알려줘야 한다.
        syncTriggerFieldUi(triggerField);
    }

    updateKeywordTriggerSummary();
}

export function applyKeywordTriggerToPrompt(promptId) {
    const prompt = promptManager?.getPromptById?.(promptId);
    if (!prompt) return;

    const triggers = Array.isArray(prompt.injection_trigger) ? prompt.injection_trigger : [];
    const selected = triggers.includes(KEYWORD_TRIGGER_OPTION);

    // "키워드"는 우리 쪽 필드로 옮기고 injection_trigger에는 생성타입만 남긴다.
    // 이래야 확장이 없는 환경에서도 프롬프트가 조용히 죽지 않는다.
    if (selected) {
        prompt.injection_trigger = triggers.filter(trigger => trigger !== KEYWORD_TRIGGER_OPTION);
    }

    // 기능이 꺼져 있으면 폼에 옵션 자체가 없다. 기존 설정은 그대로 둔다.
    if (!isKeywordTriggerFeatureEnabled()) return;

    const draft = keywordTriggerDraft.promptId === promptId
        ? keywordTriggerDraft.config
        : getKeywordTriggerConfig(prompt);
    const config = normalizeKeywordTriggerConfig({ ...draft, enabled: selected });

    if (!config.enabled && !config.keywords.length) {
        delete prompt[KEYWORD_TRIGGER_KEY];
    } else {
        prompt[KEYWORD_TRIGGER_KEY] = config;
    }

    promptManager.saveServiceSettings?.();
}

function showKeywordTriggerModal() {
    const config = keywordTriggerDraft.config;

    const removeModal = () => {
        overlay.remove();
        modal.remove();
        // 취소로 닫을 때도 상태를 다시 계산한다. 안 그러면 Triggers에서 "키워드"가 풀려 있어도
        // 이 줄이 그대로 남아 켜져 있는 것처럼 보인다.
        updateKeywordTriggerSummary();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal custom_preset_keyword_trigger_modal';

    const title = document.createElement('h3');
    title.textContent = L.keywordTriggerModalTitle;
    title.style.marginBottom = '10px';

    const makeLabel = (text) => {
        const label = document.createElement('label');
        label.innerHTML = `<strong>${text}</strong>`;
        label.style.display = 'block';
        label.style.marginTop = '10px';
        label.style.marginBottom = '4px';
        return label;
    };

    const makeNote = (text) => {
        const note = document.createElement('small');
        note.className = 'notes';
        note.textContent = text;
        note.style.display = 'block';
        note.style.opacity = '0.6';
        return note;
    };

    const makeCheckbox = (text, checked) => {
        const label = document.createElement('label');
        label.className = 'checkbox_label';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        const span = document.createElement('span');
        span.textContent = text;
        label.appendChild(input);
        label.appendChild(span);
        return { label, input };
    };

    const keywordsArea = document.createElement('textarea');
    keywordsArea.className = 'text_pole';
    keywordsArea.rows = 3;
    keywordsArea.placeholder = L.keywordTriggerListPlaceholder;
    keywordsArea.value = config.keywords.join(', ');

    const matchSelect = document.createElement('select');
    matchSelect.className = 'text_pole';
    for (const [value, text] of [['any', L.keywordTriggerMatchAny], ['all', L.keywordTriggerMatchAll]]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        matchSelect.appendChild(option);
    }
    matchSelect.value = config.matchAll ? 'all' : 'any';

    const caseSensitive = makeCheckbox(L.keywordTriggerCase, config.caseSensitive);

    const targetSelect = document.createElement('select');
    targetSelect.className = 'text_pole';
    for (const [value, text] of [['all', L.keywordTriggerScanAll], ['user', L.keywordTriggerScanUser], ['assistant', L.keywordTriggerScanAssistant]]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        targetSelect.appendChild(option);
    }
    targetSelect.value = config.scanTarget;

    const depthInput = document.createElement('input');
    depthInput.type = 'number';
    depthInput.className = 'text_pole';
    depthInput.min = '1';
    depthInput.max = String(KEYWORD_TRIGGER_MAX_DEPTH);
    depthInput.placeholder = L.keywordTriggerDepthPlaceholder(getGlobalKeywordScanDepth());
    depthInput.value = config.scanDepth === null ? '' : String(config.scanDepth);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.marginTop = '15px';

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
        keywordTriggerDraft.config = normalizeKeywordTriggerConfig({
            ...keywordTriggerDraft.config,
            // 줄바꿈으로 붙여넣어도 되게 쉼표로 바꿔서 넘긴다.
            keywords: splitKeywordsAndRegexes(keywordsArea.value.replace(/\n/g, ',')),
            matchAll: matchSelect.value === 'all',
            caseSensitive: caseSensitive.input.checked,
            scanTarget: targetSelect.value,
            scanDepth: depthInput.value.trim(),
        });
        removeModal();
    });

    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(confirmBtn);

    modal.appendChild(title);
    modal.appendChild(makeLabel(L.keywordTriggerListLabel));
    modal.appendChild(makeNote(`${L.keywordTriggerListHint} ${L.keywordTriggerEmptyWarn}`));
    modal.appendChild(keywordsArea);
    modal.appendChild(makeLabel(L.keywordTriggerMatchLabel));
    modal.appendChild(matchSelect);
    modal.appendChild(caseSensitive.label);
    modal.appendChild(makeNote(L.keywordTriggerCaseNote));
    modal.appendChild(makeLabel(L.keywordTriggerScanTargetLabel));
    modal.appendChild(targetSelect);
    modal.appendChild(makeLabel(L.keywordTriggerDepthLabel));
    modal.appendChild(makeNote(L.keywordTriggerDepthHint));
    modal.appendChild(depthInput);
    modal.appendChild(btnRow);

    // 프롬프트 편집창 밖을 눌렀다고 판단해서 ST가 창을 닫아버리는 걸 막는다.
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
        modal.style.top = Math.max(10, (window.innerHeight - modalHeight) / 2) + 'px';
        modal.style.left = Math.max(10, (window.innerWidth - modalWidth) / 2) + 'px';
    });
}

/**
 * 뒤에서부터 검사할 메시지 본문을 모은다.
 * 스캔 대상을 좁히면 깊이도 그 대상들 중에서 센다. ("최근 유저 메시지 2개")
 * @param {number} depth - 모을 메시지 개수
 * @param {'all'|'user'|'assistant'} target - 스캔 대상
 * @returns {string[]}
 */
function collectKeywordScanTexts(depth, target) {
    if (!Array.isArray(chat) || chat.length === 0) return [];

    const texts = [];
    for (let i = chat.length - 1; i >= 0 && texts.length < depth; i--) {
        const message = chat[i];
        if (!message || message.is_system) continue;
        if (target === 'user' && !message.is_user) continue;
        if (target === 'assistant' && message.is_user) continue;
        texts.push(String(message.mes ?? ''));
    }
    return texts;
}

function keywordTriggerMatches(config) {
    // 키워드를 하나도 안 적었으면 거는 조건이 없는 것으로 본다.
    if (!config.keywords.length) return true;

    const depth = config.scanDepth ?? getGlobalKeywordScanDepth();
    const texts = collectKeywordScanTexts(depth, config.scanTarget);
    if (!texts.length) return false;

    const haystack = texts.join('\n');
    const loweredHaystack = config.caseSensitive ? haystack : haystack.toLowerCase();

    const test = (keyword) => {
        // 로어북과 같은 규칙: /패턴/플래그 형태만 정규식으로 본다.
        // 문법이 틀리면 parseRegexFromString이 null을 주고, 그냥 평문 키워드로 취급된다.
        const regex = parseRegexFromString(keyword);
        if (regex) return regex.test(haystack);

        // 대소문자 구분 설정은 평문 키워드에만 적용된다. 정규식은 자기 플래그를 따른다.
        return loweredHaystack.includes(config.caseSensitive ? keyword : keyword.toLowerCase());
    };

    return config.matchAll ? config.keywords.every(test) : config.keywords.some(test);
}

/**
 * PromptManager.shouldTrigger를 감싸 키워드 조건을 AND로 얹는다.
 * 인스턴스는 한 번만 만들어지므로 패치도 한 번이면 된다.
 * @returns {boolean} 패치 성공 여부
 */
function patchPromptManagerShouldTrigger() {
    if (shouldTriggerPatched) return true;
    if (!promptManager || typeof promptManager.shouldTrigger !== 'function') return false;

    const original = promptManager.shouldTrigger.bind(promptManager);
    promptManager.shouldTrigger = function (prompt, generationType) {
        if (!original(prompt, generationType)) return false;
        if (!isKeywordTriggerFeatureEnabled()) return true;

        const raw = prompt?.[KEYWORD_TRIGGER_KEY];
        if (!raw) return true;

        const config = normalizeKeywordTriggerConfig(raw);
        if (!config.enabled) return true;

        try {
            return keywordTriggerMatches(config);
        } catch (e) {
            // 판정에 실패하면 프롬프트를 조용히 빼는 것보다 넣는 쪽이 안전하다.
            console.warn(`[${EXTENSION_NAME}] keyword trigger evaluation failed:`, e);
            return true;
        }
    };

    shouldTriggerPatched = true;
    return true;
}

/**
 * promptManager는 채팅 완성 설정이 올라온 뒤에야 만들어지므로 몇 번 다시 시도한다.
 */
export function ensureKeywordTriggerPatch(attempt = 0) {
    if (patchPromptManagerShouldTrigger()) return;
    if (attempt >= 20) {
        console.warn(`[${EXTENSION_NAME}] prompt manager not ready, keyword trigger disabled`);
        return;
    }
    setTimeout(() => ensureKeywordTriggerPatch(attempt + 1), 500);
}

/**
 * 편집창 작업본을 기본값으로 되돌린다. ST의 프롬프트 되돌리기(↺)와 짝을 이룬다.
 */
export function resetKeywordTriggerDraft() {
    keywordTriggerDraft.config = normalizeKeywordTriggerConfig(null);
    updateKeywordTriggerSummary();
}
