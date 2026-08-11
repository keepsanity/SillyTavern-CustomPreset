// 프롬프트 번역. 커넥션 프로파일로 번역을 돌리고 결과를 확장 설정에 캐시한다.
import { getFeatureSettings, saveFeatureSettings } from './settings-store.js';
import { L } from './translations.js';

function getStoredTranslation(promptId) {
    const settings = getFeatureSettings();
    if (!settings.translations || typeof settings.translations !== 'object') return null;
    const entry = settings.translations[promptId];
    if (!entry || !entry.translated) return null;
    return entry;
}

function setStoredTranslation(promptId, original, translated) {
    const settings = getFeatureSettings();
    if (!settings.translations || typeof settings.translations !== 'object') {
        settings.translations = {};
    }
    settings.translations[promptId] = {
        original,
        translated,
        translatedAt: Date.now(),
    };
    saveFeatureSettings();
}

function deleteStoredTranslation(promptId) {
    const settings = getFeatureSettings();
    if (!settings.translations || typeof settings.translations !== 'object') return;
    delete settings.translations[promptId];
    saveFeatureSettings();
}

function buildTranslationPrompt(content) {
    const settings = getFeatureSettings();
    const template = (settings.translationPromptTemplate || '').trim() || L.translationDefault;
    if (template.includes('{content}')) {
        return template.replace('{content}', content);
    }
    return `${template}\n\n${content}`;
}

async function translatePromptContent(promptId, content) {
    const settings = getFeatureSettings();
    const profileId = settings.translationProfileId;
    if (!profileId) {
        toastr.warning(L.translateNoProfile);
        return null;
    }

    const trimmed = (content || '').trim();
    if (!trimmed) {
        toastr.warning(L.translateEmpty);
        return null;
    }

    const context = (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) ? SillyTavern.getContext() : null;
    if (!context?.ConnectionManagerRequestService) {
        toastr.error(L.translateNoConnectionManager);
        return null;
    }

    try {
        const userPrompt = buildTranslationPrompt(content);
        const messages = [
            { role: 'system', content: 'You are a professional translator. Output ONLY the translated text without any commentary.' },
            { role: 'user', content: userPrompt },
        ];

        const response = await context.ConnectionManagerRequestService.sendRequest(
            profileId,
            messages,
            32000,
            { stream: false, extractData: true, includePreset: false, includeInstruct: false },
        );

        let translated = '';
        if (typeof response === 'string') {
            translated = response;
        } else if (response?.choices?.[0]?.message) {
            translated = response.choices[0].message.content || '';
        } else {
            translated = response?.content || response?.message || '';
        }

        translated = (translated || '').trim();
        if (!translated) throw new Error('empty response');

        setStoredTranslation(promptId, content, translated);
        toastr.success(L.translateSuccess);
        return translated;
    } catch (err) {
        console.error('[CustomPreset] Translation failed:', err);
        toastr.error(L.translateFailed(err.message || String(err)));
        return null;
    }
}

function showTranslationModal(promptId, promptName) {
    const entry = getStoredTranslation(promptId);
    if (!entry) return;

    const removeModal = () => {
        overlay.remove();
        modal.remove();
    };

    const overlay = document.createElement('div');
    overlay.className = 'custom_preset_position_modal_overlay';

    const modal = document.createElement('div');
    modal.className = 'custom_preset_position_modal custom_preset_compare_modal';

    const title = document.createElement('h3');
    title.textContent = `${L.translateModalTitle}: ${promptName || ''}`;
    title.style.marginBottom = '10px';

    const originalLabel = document.createElement('label');
    originalLabel.textContent = L.translateOriginal;
    originalLabel.style.fontWeight = '600';
    originalLabel.style.marginBottom = '4px';
    originalLabel.style.display = 'block';

    const originalArea = document.createElement('textarea');
    originalArea.className = 'text_pole custom_preset_compare_textarea';
    originalArea.value = entry.original || '';
    originalArea.readOnly = true;
    originalArea.style.opacity = '0.8';

    const translatedLabel = document.createElement('label');
    translatedLabel.textContent = L.translateTranslated;
    translatedLabel.style.fontWeight = '600';
    translatedLabel.style.marginTop = '14px';
    translatedLabel.style.marginBottom = '4px';
    translatedLabel.style.display = 'block';

    const translatedArea = document.createElement('textarea');
    translatedArea.className = 'text_pole custom_preset_compare_textarea';
    translatedArea.value = entry.translated || '';
    translatedArea.readOnly = true;

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.justifyContent = 'flex-end';
    btnRow.style.marginTop = '10px';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'menu_button';
    closeBtn.textContent = L.cancel;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeModal();
    });

    btnRow.appendChild(closeBtn);

    modal.appendChild(title);
    modal.appendChild(originalLabel);
    modal.appendChild(originalArea);
    modal.appendChild(translatedLabel);
    modal.appendChild(translatedArea);
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

export function ensureTranslateButtonInPopup() {
    const editPopup = document.getElementById('completion_prompt_manager_popup_edit');
    if (!editPopup) return;
    const promptLabel = editPopup.querySelector('label[for="completion_prompt_manager_popup_entry_form_prompt"]');
    if (!promptLabel) return;

    const labelContainer = promptLabel.closest('.flex1');
    if (!labelContainer) return;

    // Use the parent flex-container so buttons sit on the far right
    const flexRow = labelContainer.parentElement;
    if (!flexRow) return;

    // Remove existing buttons to refresh state
    const existing = document.getElementById('custom_preset_translate_btn_group');
    if (existing) existing.remove();

    if (!getFeatureSettings().showTranslateFeature) return;

    const saveBtn = document.getElementById('completion_prompt_manager_popup_entry_form_save');
    const promptId = saveBtn?.dataset?.pmPrompt;
    if (!promptId) return;

    const btnGroup = document.createElement('span');
    btnGroup.id = 'custom_preset_translate_btn_group';
    btnGroup.className = 'custom_preset_translate_btn_group';

    const renderButtons = () => {
        btnGroup.innerHTML = '';
        const current = getStoredTranslation(promptId);

        if (!current) {
            const translateBtn = document.createElement('button');
            translateBtn.type = 'button';
            translateBtn.className = 'menu_button custom_preset_translate_btn';
            translateBtn.title = L.translate;
            translateBtn.innerHTML = `<i class="fa-solid fa-language"></i>`;
            translateBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const textarea = document.getElementById('completion_prompt_manager_popup_entry_form_prompt');
                const content = textarea?.value || '';
                translateBtn.disabled = true;
                translateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                const result = await translatePromptContent(promptId, content);
                if (result) {
                    renderButtons();
                } else {
                    translateBtn.disabled = false;
                    translateBtn.innerHTML = `<i class="fa-solid fa-language"></i>`;
                }
            });
            btnGroup.appendChild(translateBtn);
        } else {
            const promptName = (document.getElementById('completion_prompt_manager_popup_entry_form_name')?.value || '').trim();

            const viewBtn = document.createElement('button');
            viewBtn.type = 'button';
            viewBtn.className = 'menu_button custom_preset_translate_btn';
            viewBtn.title = L.viewTranslation;
            viewBtn.innerHTML = `<i class="fa-solid fa-book-open"></i>`;
            viewBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showTranslationModal(promptId, promptName);
            });

            const retranslateBtn = document.createElement('button');
            retranslateBtn.type = 'button';
            retranslateBtn.className = 'menu_button custom_preset_translate_btn';
            retranslateBtn.title = L.retranslate;
            retranslateBtn.innerHTML = `<i class="fa-solid fa-rotate"></i>`;
            retranslateBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const textarea = document.getElementById('completion_prompt_manager_popup_entry_form_prompt');
                const content = textarea?.value || '';
                retranslateBtn.disabled = true;
                viewBtn.disabled = true;
                retranslateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i>`;
                await translatePromptContent(promptId, content);
                renderButtons();
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'menu_button custom_preset_translate_btn custom_preset_translate_delete_btn';
            deleteBtn.title = L.deleteTranslation;
            deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!confirm(L.deleteTranslationConfirm)) return;
                deleteStoredTranslation(promptId);
                toastr.success(L.translationDeleted);
                renderButtons();
            });

            btnGroup.appendChild(viewBtn);
            btnGroup.appendChild(retranslateBtn);
            btnGroup.appendChild(deleteBtn);
        }
    };

    renderButtons();
    flexRow.appendChild(btnGroup);
}
