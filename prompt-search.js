// 프롬프트 편집창 안에서 단어검색. 일치 지점을 차례로 선택해 보여준다.
// textarea 안의 글자는 직접 색칠할 수 없어서 브라우저 기본 선택 표시에 맡긴다.
import { getFeatureSettings } from './settings-store.js';
import { L } from './translations.js';

const TEXTAREA_ID = 'completion_prompt_manager_popup_entry_form_prompt';
const EDIT_POPUP_ID = 'completion_prompt_manager_popup_edit';
const BAR_ID = 'custom_preset_prompt_search_bar';
const INPUT_ID = 'custom_preset_prompt_search_input';
const COUNTER_ID = 'custom_preset_prompt_search_counter';
const TOGGLE_ID = 'custom_preset_prompt_search_toggle';

let matches = [];
let activeIndex = -1;

function getTextarea() {
    return document.getElementById(TEXTAREA_ID);
}

// 겹치는 일치는 세지 않는다. 대소문자는 구분하지 않는다.
function findMatches(text, query) {
    const found = [];
    if (!query) return found;
    const haystack = text.toLowerCase();
    const needle = query.toLowerCase();
    let from = 0;
    for (;;) {
        const at = haystack.indexOf(needle, from);
        if (at === -1) break;
        found.push(at);
        from = at + needle.length;
    }
    return found;
}

// 자동 줄바꿈까지 반영해서 일치 지점의 세로 위치를 잰다.
// 줄 개수 × 줄 높이로 계산하면 긴 문단이 여러 줄로 접힐 때 크게 어긋난다.
function measureTopOffset(textarea, index) {
    const style = getComputedStyle(textarea);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;

    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.top = '0';
    probe.style.left = '-9999px';
    probe.style.visibility = 'hidden';
    probe.style.boxSizing = 'content-box';
    probe.style.width = `${Math.max(0, textarea.clientWidth - padLeft - padRight)}px`;
    probe.style.whiteSpace = 'pre-wrap';
    probe.style.overflowWrap = 'break-word';
    probe.style.wordBreak = style.wordBreak;
    probe.style.fontFamily = style.fontFamily;
    probe.style.fontSize = style.fontSize;
    probe.style.fontWeight = style.fontWeight;
    probe.style.fontStyle = style.fontStyle;
    probe.style.lineHeight = style.lineHeight;
    probe.style.letterSpacing = style.letterSpacing;
    probe.style.tabSize = style.tabSize;
    probe.textContent = textarea.value.slice(0, index);

    const marker = document.createElement('span');
    marker.textContent = String.fromCharCode(0x200b);
    probe.appendChild(marker);

    document.body.appendChild(probe);
    const top = marker.offsetTop;
    probe.remove();
    return top;
}

function scrollToMatch(textarea, index) {
    const padTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    const top = measureTopOffset(textarea, index) + padTop;
    textarea.scrollTop = Math.max(0, top - (textarea.clientHeight / 2));
}

function renderCounter() {
    const counter = document.getElementById(COUNTER_ID);
    if (!counter) return;
    if (!matches.length) {
        const input = document.getElementById(INPUT_ID);
        counter.textContent = input?.value ? L.promptSearchNoMatch : '';
        return;
    }
    counter.textContent = L.promptSearchCount(activeIndex + 1, matches.length);
}

function recount() {
    const textarea = getTextarea();
    const input = document.getElementById(INPUT_ID);
    matches = textarea && input ? findMatches(textarea.value, input.value) : [];
    activeIndex = -1;
    renderCounter();
}

function jump(direction) {
    const textarea = getTextarea();
    const input = document.getElementById(INPUT_ID);
    if (!textarea || !input) return;

    const query = input.value;
    matches = findMatches(textarea.value, query);
    if (!matches.length) {
        activeIndex = -1;
        renderCounter();
        return;
    }

    // 커서 위치를 기준으로 고른다. 중간에 본문을 고쳐도 자연스럽게 이어진다.
    const caret = direction > 0 ? textarea.selectionEnd : textarea.selectionStart;
    let next = -1;
    if (direction > 0) {
        next = matches.findIndex(at => at >= caret);
        if (next === -1) next = 0;
    } else {
        for (let i = matches.length - 1; i >= 0; i--) {
            if (matches[i] + query.length <= caret) {
                next = i;
                break;
            }
        }
        if (next === -1) next = matches.length - 1;
    }

    activeIndex = next;
    const start = matches[next];
    textarea.focus();
    textarea.setSelectionRange(start, start + query.length);
    scrollToMatch(textarea, start);
    renderCounter();
}

function isBarOpen() {
    const bar = document.getElementById(BAR_ID);
    return !!bar && bar.style.display !== 'none';
}

function closeBar() {
    const bar = document.getElementById(BAR_ID);
    const input = document.getElementById(INPUT_ID);
    if (bar) bar.style.display = 'none';
    if (input) input.value = '';
    matches = [];
    activeIndex = -1;
    renderCounter();
}

function openBar() {
    const bar = document.getElementById(BAR_ID);
    const input = document.getElementById(INPUT_ID);
    if (!bar || !input) return;
    bar.style.display = '';
    input.focus();
    input.select();
}

function makeIconButton(id, iconClass, title) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = id;
    btn.className = 'menu_button custom_preset_prompt_search_btn';
    btn.title = title;
    btn.innerHTML = `<i class="${iconClass}"></i>`;
    return btn;
}

function buildBar() {
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'custom_preset_prompt_search_bar';
    bar.style.display = 'none';

    const input = document.createElement('input');
    input.id = INPUT_ID;
    input.type = 'search';
    input.className = 'text_pole custom_preset_prompt_search_input';
    input.placeholder = L.promptSearchPlaceholder;

    const counter = document.createElement('span');
    counter.id = COUNTER_ID;
    counter.className = 'custom_preset_prompt_search_counter';

    const prevBtn = makeIconButton('custom_preset_prompt_search_prev', 'fa-solid fa-chevron-up', L.promptSearchPrev);
    const nextBtn = makeIconButton('custom_preset_prompt_search_next', 'fa-solid fa-chevron-down', L.promptSearchNext);
    const closeBtn = makeIconButton('custom_preset_prompt_search_close', 'fa-solid fa-xmark', L.promptSearchClose);

    // 버튼을 눌러도 텍스트에리어의 포커스를 뺏지 않는다. 포커스가 빠지면 선택 표시가 사라진다.
    const holdFocus = (e) => e.preventDefault();
    for (const btn of [prevBtn, nextBtn]) {
        btn.addEventListener('mousedown', holdFocus);
    }

    prevBtn.addEventListener('click', () => jump(-1));
    nextBtn.addEventListener('click', () => jump(1));
    closeBtn.addEventListener('click', () => closeBar());

    input.addEventListener('input', () => recount());
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            jump(e.shiftKey ? -1 : 1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeBar();
        }
    });

    bar.appendChild(input);
    bar.appendChild(counter);
    bar.appendChild(prevBtn);
    bar.appendChild(nextBtn);
    bar.appendChild(closeBtn);
    return bar;
}

export function isPromptSearchFeatureEnabled() {
    return getFeatureSettings().showPromptSearchFeature !== false;
}

// 설정을 끄면 버튼을 숨기고 열려 있던 바도 닫는다. 다시 켜면 여기서 만들어 붙인다.
export function ensurePromptSearchControls() {
    if (!isPromptSearchFeatureEnabled()) {
        closeBar();
        const toggle = document.getElementById(TOGGLE_ID);
        if (toggle) toggle.style.display = 'none';
        return;
    }

    const textarea = getTextarea();
    if (!textarea) return;

    if (!document.getElementById(BAR_ID)) {
        textarea.parentElement?.insertBefore(buildBar(), textarea);
    }

    if (!document.getElementById(TOGGLE_ID)) {
        // 같은 for를 가진 라벨이 위쪽 Inspect 패널에도 있다. 반드시 편집 폼 안에서만 찾는다.
        const editPopup = document.getElementById(EDIT_POPUP_ID);
        const promptLabel = editPopup?.querySelector(`label[for="${TEXTAREA_ID}"]`);
        const labelContainer = promptLabel?.closest('.flex1');
        if (labelContainer) {
            const toggle = makeIconButton(TOGGLE_ID, 'fa-solid fa-magnifying-glass', L.promptSearch);
            toggle.addEventListener('click', () => {
                if (isBarOpen()) closeBar();
                else openBar();
            });
            labelContainer.appendChild(toggle);
        }
    }

    // 껐다 켠 경우 숨겨둔 버튼을 되살린다. (CSS의 inline-flex가 다시 먹도록 비운다)
    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) toggle.style.display = '';
}

// 다른 프롬프트로 넘어가면 이전 검색어가 남아있을 이유가 없다.
export function resetPromptSearch() {
    closeBar();
}
