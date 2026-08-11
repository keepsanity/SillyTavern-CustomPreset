// 프롬프트 미리보기 / 인터셉트.
// 전송 직전에 실제로 조립된 프롬프트를 보여준다. dry-run 캡처도 여기 있다.
import { Generate, eventSource, event_types, main_api, stopGeneration } from '../../../../script.js';
import { getTokenCountAsync } from '../../../tokenizers.js';
import { EXTENSION_NAME } from './constants.js';
import { getFeatureSettings } from './settings-store.js';
import { copyToClipboard } from './shared.js';
import { L } from './translations.js';

// ----- Intercept (Prompt Inspector style): show the real prompt before every send -----
const PROMPT_INTERCEPT_KEY = 'cpm_prompt_intercept_enabled';
export let interceptEnabled = localStorage.getItem(PROMPT_INTERCEPT_KEY) === 'true';
let interceptListenersBound = false;
const PREVIEW_ROLE_META = {
    system: { label: 'system', cls: 'role_system', icon: 'fa-gear' },
    user: { label: 'user', cls: 'role_user', icon: 'fa-user' },
    assistant: { label: 'assistant', cls: 'role_assistant', icon: 'fa-robot' },
    tool: { label: 'tool', cls: 'role_tool', icon: 'fa-wrench' },
    prompt: { label: 'prompt', cls: 'role_prompt', icon: 'fa-align-left' },
};
let promptManagerHeaderObserver = null;

function isPromptPreviewFeatureEnabled() {
    return getFeatureSettings().showPromptPreviewFeature !== false;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightHtml(text, keyword) {
    const escaped = escapeHtml(text);
    if (!keyword) return escaped;
    const safe = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.replace(new RegExp(safe, 'gi'), (m) => `<mark class="custom_preset_preview_mark">${m}</mark>`);
}

// Normalize a chat completion message content (string | array of parts) to text.
function normalizeMessageContent(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map((part) => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if (typeof part.text === 'string') return part.text;
                if (part.type === 'image_url') return '[image]';
                return '';
            }
            return '';
        }).filter(Boolean).join('\n');
    }
    if (content == null) return '';
    return String(content);
}

// Which event carries the real prompt for the active API.
// (For Chat Completion, GENERATE_AFTER_COMBINE_PROMPTS also fires but with an empty text prompt.)
function getPromptEventType() {
    return main_api === 'openai'
        ? event_types.CHAT_COMPLETION_PROMPT_READY
        : event_types.GENERATE_AFTER_COMBINE_PROMPTS;
}

// Turn a *_PROMPT_READY event payload into a uniform preview result.
function parsePromptEventData(data) {
    if (Array.isArray(data?.chat)) {
        const source = data.chat;
        return {
            isChat: true,
            messages: source.map((m) => ({ role: m?.role || 'unknown', content: normalizeMessageContent(m?.content) })),
            // Preserve original (possibly multimodal) content for the raw JSON view.
            raw: source.map((m) => ({ role: m?.role || 'unknown', content: m?.content ?? '' })),
        };
    }
    const text = String(data?.prompt ?? '');
    return { isChat: false, messages: [{ role: 'prompt', content: text }], raw: text };
}

/**
 * Triggers a dry-run generation and captures the assembled prompt without sending it.
 * @returns {Promise<{isChat: boolean, messages: Array, raw: any}>}
 */
function capturePromptForPreview() {
    return new Promise((resolve, reject) => {
        let settled = false;
        let eventFired = false;
        const evt = getPromptEventType();

        const cleanup = () => {
            clearTimeout(timer);
            eventSource.removeListener(evt, onEvent);
        };
        const settle = (result) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(result);
        };
        const fail = (err) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
        };

        const onEvent = (data) => {
            if (!data || !data.dryRun) return;
            eventFired = true;
            settle(parsePromptEventData(data));
        };

        const timer = setTimeout(() => fail(new Error('Prompt preview timed out')), 20000);
        eventSource.on(evt, onEvent);

        // Dry run assembles the prompt without sending and emits the *_PROMPT_READY event.
        Promise.resolve()
            .then(() => Generate('normal', {}, true))
            .then(() => {
                // Generate returned but never emitted a prompt event -> nothing was assembled
                // (usually because no character/chat is open). Fail fast instead of waiting for timeout.
                if (!eventFired) {
                    setTimeout(() => {
                        if (!eventFired) fail(new Error('NO_PROMPT_EVENT'));
                    }, 400);
                }
            })
            .catch((e) => {
                console.error(`[${EXTENSION_NAME}] dry-run Generate error`, e);
                if (!eventFired) fail(e);
            });
    });
}

// ----- On-demand dry-run preview (wand: "프롬프트 미리보기") -----
async function runDryRunPreview() {
    toastr.info(L.promptPreviewBuilding);
    let result;
    try {
        result = await capturePromptForPreview();
    } catch (e) {
        console.error(`[${EXTENSION_NAME}] Prompt preview failed`, e);
        if (e && (e.message === 'NO_PROMPT_EVENT' || e.message === 'Prompt preview timed out')) {
            toastr.warning(L.promptPreviewNeedChat);
        } else {
            toastr.error(L.promptPreviewFailed);
        }
        return;
    }
    if (!result || !Array.isArray(result.messages) || result.messages.length === 0) {
        toastr.warning(L.promptPreviewEmpty);
        return;
    }
    result.mode = 'dryrun';
    showPromptPreviewModal(result);
}

function openPromptPreview() {
    runDryRunPreview();
}

export function setInterceptEnabled(on) {
    interceptEnabled = !!on;
    localStorage.setItem(PROMPT_INTERCEPT_KEY, String(interceptEnabled));
    updatePromptInterceptMenuState();
}

function toggleIntercept() {
    setInterceptEnabled(!interceptEnabled);
    toastr.info(interceptEnabled ? L.promptInterceptOnToast : L.promptInterceptOffToast);
}

// Bound once; the handler is gated by the interceptEnabled flag (like Prompt Inspector).
// Generation pauses while the modal is open because eventSource.emit awaits async listeners.
export function bindInterceptListeners() {
    if (interceptListenersBound) return;
    interceptListenersBound = true;

    const makeHandler = (evtName) => async (data) => {
        if (!interceptEnabled) return;
        if (getPromptEventType() !== evtName) return; // ignore the inactive API's event
        if (!data || data.dryRun) return;             // only the real send
        const result = parsePromptEventData(data);
        if (!result.messages.length) return;
        result.mode = 'intercept';
        await showPromptPreviewModal(result, {
            intercept: true,
            onApplyEdits: (edits) => {
                for (const { idx, newContent } of edits) {
                    if (data.chat?.[idx] != null) {
                        data.chat[idx].content = newContent;
                    }
                }
            },
            onCancel: async () => {
                try { await stopGeneration(); } catch { /* noop */ }
                toastr.info(L.promptPreviewGenCancelled);
            },
        });
    };

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, makeHandler(event_types.CHAT_COMPLETION_PROMPT_READY));
    eventSource.on(event_types.GENERATE_AFTER_COMBINE_PROMPTS, makeHandler(event_types.GENERATE_AFTER_COMBINE_PROMPTS));
}

export function updatePromptInterceptMenuState() {
    const item = document.getElementById('custom_preset_prompt_intercept_menu_item');
    if (!item) return;
    item.classList.toggle('cpm_preview_armed', interceptEnabled);
    const icon = item.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-wand-magic-sparkles';
    const label = item.querySelector('span');
    if (label) label.textContent = interceptEnabled ? L.promptInterceptOff : L.promptInterceptOn;
}

// Returns a Promise that resolves when the modal is closed (so intercept can await it).
// options: { intercept?: boolean, onCancel?: () => void|Promise }
function showPromptPreviewModal(result, options = {}) {
  return new Promise((resolveClose) => {
    const messages = result.messages;
    // JSON.stringify escapes real line breaks as literal "\n"/"\t"; unescape them so the
    // raw view reads naturally instead of showing the backslash sequences.
    const rawText = (result.isChat
        ? JSON.stringify(result.raw ?? messages, null, 2)
        : String(result.raw ?? ''))
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"');
    let closed = false;
    const removeModal = () => {
        if (closed) return;
        closed = true;
        overlay.remove();
        document.removeEventListener('keydown', onKeyDown);
        resolveClose();
    };
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            removeModal();
        }
    };

    // Flex-centered overlay (mobile-safe): the modal is a child centered by the overlay.
    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_preview_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_preview_modal';

    // --- Header ---
    const header = document.createElement('div');
    header.className = 'custom_preset_preview_header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'custom_preset_preview_titlewrap';

    const title = document.createElement('h3');
    title.textContent = L.promptPreviewTitle;

    titleWrap.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'custom_preset_preview_stats';
    const totalChars = messages.reduce((sum, m) => sum + (m.content ? m.content.length : 0), 0);
    stats.textContent = `${L.promptPreviewMessages(messages.length)} · ${L.promptPreviewChars(totalChars)}`;

    header.appendChild(titleWrap);
    header.appendChild(stats);

    // --- Toolbar (search + actions) ---
    const toolbar = document.createElement('div');
    toolbar.className = 'custom_preset_preview_toolbar';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'custom_preset_preview_search_wrap';
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-magnifying-glass custom_preset_preview_search_icon';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'text_pole custom_preset_preview_search';
    searchInput.placeholder = L.promptPreviewSearchPlaceholder;
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(searchInput);

    const actions = document.createElement('div');
    actions.className = 'custom_preset_preview_actions';

    const expandBtn = document.createElement('div');
    expandBtn.className = 'menu_button custom_preset_preview_action_btn';
    expandBtn.title = L.promptPreviewExpandAll;
    expandBtn.innerHTML = '<i class="fa-solid fa-angles-down"></i>';

    const collapseBtn = document.createElement('div');
    collapseBtn.className = 'menu_button custom_preset_preview_action_btn';
    collapseBtn.title = L.promptPreviewCollapseAll;
    collapseBtn.innerHTML = '<i class="fa-solid fa-angles-up"></i>';

    const rawBtn = document.createElement('div');
    rawBtn.className = 'menu_button custom_preset_preview_action_btn';
    rawBtn.title = L.promptPreviewToggleRaw;
    rawBtn.innerHTML = '<i class="fa-solid fa-code"></i>';

    const copyAllBtn = document.createElement('div');
    copyAllBtn.className = 'menu_button custom_preset_preview_action_btn';
    copyAllBtn.title = L.promptPreviewCopyAll;
    copyAllBtn.innerHTML = '<i class="fa-solid fa-copy"></i>';

    actions.appendChild(expandBtn);
    actions.appendChild(collapseBtn);
    actions.appendChild(rawBtn);
    actions.appendChild(copyAllBtn);

    toolbar.appendChild(searchWrap);
    toolbar.appendChild(actions);

    // --- Card list ---
    const list = document.createElement('div');
    list.className = 'custom_preset_preview_list';

    const emptyResults = document.createElement('div');
    emptyResults.className = 'custom_preset_preview_empty';
    emptyResults.textContent = L.promptPreviewNoResults;
    emptyResults.style.display = 'none';

    const cards = messages.map((msg, idx) => buildPreviewCard(msg, idx, { editable: !!options.intercept && result.isChat }));
    cards.forEach((c) => list.appendChild(c.element));
    list.appendChild(emptyResults);

    // --- Raw (JSON) view ---
    const rawView = document.createElement('textarea');
    rawView.className = 'text_pole custom_preset_preview_raw';
    rawView.readOnly = true;
    rawView.value = rawText;
    // Inline !important so theme extensions can't shrink it or force horizontal scrolling.
    rawView.style.setProperty('height', '62vh', 'important');
    rawView.style.setProperty('min-height', '62vh', 'important');
    rawView.style.setProperty('max-height', 'none', 'important');
    rawView.style.setProperty('width', '100%', 'important');
    rawView.style.setProperty('white-space', 'pre-wrap', 'important');
    rawView.style.setProperty('word-break', 'break-word', 'important');
    rawView.style.setProperty('overflow-x', 'hidden', 'important');
    rawView.style.setProperty('overflow-y', 'auto', 'important');
    rawView.style.setProperty('box-sizing', 'border-box', 'important');
    rawView.style.display = 'none';

    let rawMode = false;
    const setRawMode = (on) => {
        rawMode = on;
        list.style.display = on ? 'none' : '';
        rawView.style.display = on ? 'block' : 'none';
        searchWrap.style.visibility = on ? 'hidden' : '';
        expandBtn.style.display = on ? 'none' : '';
        collapseBtn.style.display = on ? 'none' : '';
        rawBtn.classList.toggle('toggled', on);
        rawBtn.title = on ? L.promptPreviewViewCards : L.promptPreviewViewRaw;
    };

    const applySearch = () => {
        const keyword = searchInput.value.trim().toLowerCase();
        let visibleCount = 0;
        for (const card of cards) {
            const hay = (card.role + '\n' + card.content).toLowerCase();
            const match = !keyword || hay.includes(keyword);
            card.element.style.display = match ? '' : 'none';
            if (match) {
                visibleCount++;
                card.renderContent(keyword);
                if (keyword) card.setCollapsed(false);
            }
        }
        emptyResults.style.display = visibleCount === 0 ? '' : 'none';
    };

    let searchTimer = null;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(applySearch, 120);
    });

    expandBtn.addEventListener('click', (e) => { e.stopPropagation(); cards.forEach((c) => c.setCollapsed(false)); });
    collapseBtn.addEventListener('click', (e) => { e.stopPropagation(); cards.forEach((c) => c.setCollapsed(true)); });
    rawBtn.addEventListener('click', (e) => { e.stopPropagation(); setRawMode(!rawMode); });
    copyAllBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = rawMode
            ? rawText
            : messages.map((m) => `### ${m.role}\n${m.content}`).join('\n\n');
        copyToClipboard(text);
    });

    // --- Footer ---
    const footer = document.createElement('div');
    footer.className = 'custom_preset_preview_footer';

    if (options.intercept) {
        // Cancel left, continue right.
        footer.style.justifyContent = 'space-between';

        // Cancel the in-flight generation before it is sent (red outline, not a filled block).
        const cancelBtn = document.createElement('div');
        cancelBtn.className = 'menu_button custom_preset_preview_cancel_btn';
        cancelBtn.innerHTML = `<i class="fa-solid fa-ban"></i><span>${escapeHtml(L.promptPreviewCancelGen)}</span>`;
        // Inline !important so theme extensions can't override the outline styling.
        cancelBtn.style.setProperty('background', 'transparent', 'important');
        cancelBtn.style.setProperty('background-image', 'none', 'important');
        cancelBtn.style.setProperty('color', '#e0555a', 'important');
        cancelBtn.style.setProperty('border', '1px solid #e0555a', 'important');
        cancelBtn.style.setProperty('filter', 'none', 'important');
        cancelBtn.querySelectorAll('i, span').forEach((el) => el.style.setProperty('color', '#e0555a', 'important'));
        cancelBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try { await options.onCancel?.(); } catch { /* noop */ }
            removeModal();
        });
        footer.appendChild(cancelBtn);
    }

    // Primary button keeps the theme's own menu_button colors (always readable on any theme).
    const closeBtn = document.createElement('div');
    closeBtn.className = 'menu_button';
    closeBtn.innerHTML = options.intercept
        ? `<i class="fa-solid fa-paper-plane"></i><span>${escapeHtml(L.promptPreviewContinue)}</span>`
        : `<span>${escapeHtml(L.promptPreviewClose)}</span>`;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (options.intercept && options.onApplyEdits) {
            const edits = cards
                .map((c, i) => c.isEdited() ? { idx: i, newContent: c.getContent() } : null)
                .filter(Boolean);
            if (edits.length) options.onApplyEdits(edits);
        }
        removeModal();
    });
    footer.appendChild(closeBtn);

    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(list);
    modal.appendChild(rawView);
    modal.appendChild(footer);

    // Close only when clicking the backdrop itself, not the panel.
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) removeModal();
    });
    document.addEventListener('keydown', onKeyDown);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    searchInput.focus();

    // --- Async token counting (updates header + each card) ---
    stats.textContent = `${L.promptPreviewMessages(messages.length)} · ${L.promptPreviewChars(totalChars)} · ${L.promptPreviewTokensCalc}`;
    (async () => {
        let totalTokens = 0;
        for (let i = 0; i < messages.length; i++) {
            let tokens = 0;
            try {
                tokens = await getTokenCountAsync(messages[i].content || '');
            } catch {
                tokens = 0;
            }
            totalTokens += tokens;
            cards[i]?.setTokens(tokens);
        }
        // Modal may have been closed while counting.
        if (!modal.isConnected) return;
        stats.textContent = `${L.promptPreviewMessages(messages.length)} · ${L.promptPreviewChars(totalChars)} · ${L.promptPreviewTokens(totalTokens)}`;
    })();
  });
}

function buildPreviewCard(msg, idx, options = {}) {
    const role = (msg.role || 'unknown').toLowerCase();
    const content = msg.content || '';
    const meta = PREVIEW_ROLE_META[role] || { label: role, cls: 'role_unknown', icon: 'fa-comment' };

    let editedContent = null;
    let inEditMode = false;
    const getContent = () => editedContent !== null ? editedContent : content;
    const isEdited = () => editedContent !== null;

    const card = document.createElement('div');
    card.className = `custom_preset_preview_card ${meta.cls}`;

    const cardHeader = document.createElement('div');
    cardHeader.className = 'custom_preset_preview_card_header';

    const left = document.createElement('div');
    left.className = 'custom_preset_preview_card_left';

    const chevron = document.createElement('i');
    chevron.className = 'fa-solid fa-chevron-down custom_preset_preview_chevron';

    const badge = document.createElement('span');
    badge.className = `custom_preset_preview_badge ${meta.cls}`;
    badge.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${escapeHtml(meta.label)}`;

    const index = document.createElement('span');
    index.className = 'custom_preset_preview_index';
    index.textContent = `#${idx + 1}`;

    const len = document.createElement('span');
    len.className = 'custom_preset_preview_len';
    len.textContent = L.promptPreviewChars(content.length);

    const tok = document.createElement('span');
    tok.className = 'custom_preset_preview_tok';

    left.appendChild(chevron);
    left.appendChild(badge);
    left.appendChild(index);
    left.appendChild(len);
    left.appendChild(tok);

    const copyBtn = document.createElement('i');
    copyBtn.className = 'fa-solid fa-copy custom_preset_preview_card_copy interactable';
    copyBtn.title = L.promptPreviewCopyCard;
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyToClipboard(getContent());
    });

    const cardActions = document.createElement('div');
    cardActions.className = 'custom_preset_preview_card_actions';
    cardActions.appendChild(copyBtn);

    cardHeader.appendChild(left);
    cardHeader.appendChild(cardActions);

    const body = document.createElement('div');
    body.className = 'custom_preset_preview_card_body';

    const renderContent = (keyword) => {
        if (inEditMode) return;
        const c = getContent();
        if (!c) {
            body.innerHTML = `<span class="custom_preset_preview_nocontent">${escapeHtml(L.noContent)}</span>`;
            return;
        }
        body.innerHTML = highlightHtml(c, keyword);
    };
    renderContent('');

    const setCollapsed = (collapsed) => {
        if (inEditMode) return;
        card.classList.toggle('collapsed', collapsed);
    };

    const setTokens = (n) => {
        tok.textContent = '· ' + L.promptPreviewTokens(n);
    };

    cardHeader.addEventListener('click', () => {
        if (inEditMode) return;
        card.classList.toggle('collapsed');
    });

    // Edit button — intercept mode only
    if (options.editable) {
        let editorEl = null;

        const editBtn = document.createElement('i');
        editBtn.className = 'fa-solid fa-pencil custom_preset_preview_card_edit interactable';
        editBtn.title = '수정';

        const enterEditMode = () => {
            inEditMode = true;
            card.classList.add('is_editing');
            card.classList.remove('collapsed');
            editBtn.className = 'fa-solid fa-check custom_preset_preview_card_edit interactable';
            editBtn.title = '저장';

            editorEl = document.createElement('textarea');
            editorEl.className = 'custom_preset_preview_card_editor';
            editorEl.value = getContent();
            body.style.display = 'none';
            card.appendChild(editorEl);
            editorEl.focus();
        };

        const exitEditMode = (save) => {
            if (save && editorEl) {
                const newVal = editorEl.value;
                editedContent = newVal !== content ? newVal : null;
                card.classList.toggle('is_edited', editedContent !== null);
            }
            if (editorEl) { editorEl.remove(); editorEl = null; }
            inEditMode = false;
            card.classList.remove('is_editing');
            editBtn.className = 'fa-solid fa-pencil custom_preset_preview_card_edit interactable';
            editBtn.title = '수정';
            body.style.display = '';
            renderContent('');
            len.textContent = L.promptPreviewChars(getContent().length);
        };

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (inEditMode) exitEditMode(true);
            else enterEditMode();
        });

        // Edit button sits just left of the copy button, grouped on the right.
        cardActions.insertBefore(editBtn, copyBtn);
    }

    card.appendChild(cardHeader);
    card.appendChild(body);

    return { element: card, role, content, renderContent, setCollapsed, setTokens, getContent, isEdited };
}

export function createPromptPreviewMenuItem() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) return null;
    if (document.getElementById('custom_preset_prompt_preview_menu_item')) return null;

    const menuItem = document.createElement('div');
    menuItem.id = 'custom_preset_prompt_preview_menu_item';
    menuItem.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    menuItem.tabIndex = 0;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-eye';
    menuItem.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.textContent = L.promptPreview;
    menuItem.appendChild(textSpan);

    menuItem.addEventListener('click', () => {
        openPromptPreview();
    });

    extensionsMenu.appendChild(menuItem);
    return menuItem;
}

export function createPromptInterceptMenuItem() {
    const extensionsMenu = document.getElementById('extensionsMenu');
    if (!extensionsMenu) return null;
    if (document.getElementById('custom_preset_prompt_intercept_menu_item')) return null;

    const menuItem = document.createElement('div');
    menuItem.id = 'custom_preset_prompt_intercept_menu_item';
    menuItem.classList.add('list-group-item', 'flex-container', 'flexGap5', 'interactable');
    menuItem.tabIndex = 0;
    menuItem.title = L.promptInterceptMenuTitle;

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-wand-magic-sparkles';
    menuItem.appendChild(icon);

    const textSpan = document.createElement('span');
    textSpan.textContent = interceptEnabled ? L.promptInterceptOff : L.promptInterceptOn;
    menuItem.appendChild(textSpan);

    menuItem.addEventListener('click', () => {
        toggleIntercept();
    });

    extensionsMenu.appendChild(menuItem);
    return menuItem;
}

// ----- Preview button next to "Prompts" in the prompt manager header -----
// The header is re-rendered by promptManager.render(), so the button is re-injected
// via a MutationObserver (see observePromptManagerHeader).
export function ensurePromptManagerPreviewButton() {
    const advanced = document.querySelector('#completion_prompt_manager .completion_prompt_manager_header_advanced');
    if (!advanced) return;

    const existing = advanced.querySelector('#custom_preset_header_preview_btn');
    if (!isPromptPreviewFeatureEnabled()) {
        if (existing) existing.remove();
        return;
    }
    if (existing) return;

    const btn = document.createElement('i');
    btn.id = 'custom_preset_header_preview_btn';
    btn.className = 'fa-solid fa-wand-sparkles custom_preset_header_preview_btn interactable';
    btn.tabIndex = 0;
    btn.title = L.promptPreview;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPromptPreview();
    });
    advanced.appendChild(btn);
}

export function observePromptManagerHeader() {
    const container = document.getElementById('completion_prompt_manager');
    if (!container || promptManagerHeaderObserver) return;

    promptManagerHeaderObserver = new MutationObserver(() => {
        ensurePromptManagerPreviewButton();
    });
    promptManagerHeaderObserver.observe(container, { childList: true, subtree: true });
    ensurePromptManagerPreviewButton();
}
